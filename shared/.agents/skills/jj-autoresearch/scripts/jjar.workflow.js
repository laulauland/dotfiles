export const meta = {
  name: 'jj-autoresearch',
  description: 'Fork-fanned tree search over jj revisions: fan each frontier node into divergent children, judge, prune, repeat until budget or convergence',
  phases: [
    { title: 'Frame', detail: 'baseline the frozen judge on the base revision' },
    { title: 'Search', detail: 'wave loop: fork-fan-out → judge → prune' },
    { title: 'Harvest', detail: 'report the winning path to linearize by hand' },
  ],
}

// args = {
//   baseChangeId, repoRoot, judge, journalPath,
//   ideas: [string],            // wave-1 moves
//   J = 3,                       // fork width per frontier node
//   M = 1,                       // beam width (frontier size kept)
//   maxWaves = 6,
//   convergenceK = 2,            // stop after K waves with no improvement
//   lowerIsBetter = true,        // score direction (val_bpb-style default)
//   budgetFloor = 60_000,        // stop opening waves below this many tokens left
// }
const {
  baseChangeId, repoRoot, judge, journalPath,
  ideas = [], J = 3, M = 1, maxWaves = 6, convergenceK = 2,
  lowerIsBetter = true, budgetFloor = 60_000,
} = args

const better = (a, b) => (lowerIsBetter ? a < b : a > b)
const bestOf = (nodes) =>
  nodes.reduce((acc, n) => (acc == null || better(n.score, acc.score) ? n : acc), null)
const topM = (nodes) =>
  [...nodes].sort((a, b) => (lowerIsBetter ? a.score - b.score : b.score - a.score)).slice(0, M)

const JUDGE_CONTRACT = `
FROZEN JUDGE — do not edit it or anything it reads to grade:
  ${judge}
Run it in your workspace and parse a single numeric score plus a pass/fail gate. An
attempt that modifies the judge, the gate, or the files it grades is VOID — report
gate:"fail" and say so. The gate outranks the score: a better number behind a failed
gate must never be reported as a pass.`

const JOURNAL_CONTRACT = `
JOURNAL — ${journalPath} (append-only, tab-separated: change_id  parent  score  gate  move  kept):
Read it first for the running record of every prior attempt — it is your shared context,
not a summary. After judging, append exactly one row for THIS attempt (kept left blank;
the orchestrator fills it). Use a shell append; never rewrite or reorder existing rows.`

const CHILD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['changeId', 'score', 'gate', 'move', 'notes'],
  properties: {
    changeId: { type: 'string', description: 'change-id of the attempt revision you created' },
    score: { type: 'number' },
    gate: { type: 'string', enum: ['pass', 'fail'] },
    move: { type: 'string', description: 'the divergent idea you implemented' },
    notes: { type: 'string', description: 'what you changed and any judge output worth a human glance' },
  },
}

const childPrompt = (node, move) => `Run one attempt in an autoresearch tree search. Repo root: ${repoRoot}.
Create an ISOLATED copy-on-write workspace forked from revision ${node.changeId} using the pando skill, and do ALL work there — never touch the base or sibling attempts.
Inside that workspace, start a fresh revision (jj new ${node.changeId}) and implement EXACTLY this divergent move, nothing else:
  ${move}
${JOURNAL_CONTRACT}
Then judge the result:${JUDGE_CONTRACT}
Return the attempt's change-id, its numeric score, the gate verdict, the move, and notes. Do not abandon, squash, or rebase any revision — leave your attempt revision in place.`

const ideaPrompt = (frontier, width) => `Propose the next wave of divergent moves for an autoresearch search. Repo root: ${repoRoot}.
Read the journal at ${journalPath} for every prior attempt, its score, and its gate.
Current frontier (the best gate-passing revisions, to fork from next):
${frontier.map((n) => `- ${n.changeId} score ${n.score}`).join('\n')}
Lean into directions the journal shows improving; drop dead ones. Propose ${width} DIVERGENT moves per frontier node — distinct approaches, not variations on one. When the obvious moves are exhausted, widen the search rather than repeat.`

const IDEAS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['moves'],
  properties: { moves: { type: 'array', items: { type: 'string' } } },
}

// --- Frame: baseline the judge on the base ---------------------------------
phase('Frame')
const base = await agent(
  `Baseline the frozen judge for an autoresearch search. Repo root: ${repoRoot}, base revision ${baseChangeId}.
Run the judge on the base exactly as-is (do not modify it):${JUDGE_CONTRACT}
Then ensure the journal exists at ${journalPath} with header "change_id\tparent\tscore\tgate\tmove\tkept" and one seeded baseline row for ${baseChangeId} (move "baseline", kept "y").
Return the baseline score and gate.`,
  { label: 'baseline', phase: 'Frame', agentType: 'operator', effort: 'low', schema: CHILD_SCHEMA },
)
let frontier = [{ changeId: baseChangeId, score: base?.score ?? (lowerIsBetter ? Infinity : -Infinity), gate: base?.gate || 'pass' }]
let incumbent = bestOf(frontier)
log(`baseline: ${incumbent.score} (${incumbent.gate})`)

// --- Search: the wave loop -------------------------------------------------
phase('Search')
let dryWaves = 0
const allAttempts = []
let pool = ideas

for (let wave = 1; wave <= maxWaves && dryWaves < convergenceK; wave++) {
  if (budget.total && budget.remaining() < budgetFloor) {
    log(`wave ${wave}: ${Math.round(budget.remaining() / 1000)}k left < floor — stopping`)
    break
  }

  // Refill ideas from the journal for waves past the seed.
  if (wave > 1 || pool.length === 0) {
    const next = await agent(ideaPrompt(frontier, J), { label: `ideas:w${wave}`, phase: 'Search', effort: 'medium', schema: IDEAS_SCHEMA })
    pool = next?.moves || []
  }
  if (!pool.length) { log(`wave ${wave}: no moves proposed — stopping`); break }

  // Fork-fan-out: every frontier node × J moves, judged in parallel.
  const tasks = frontier.flatMap((node) =>
    pool.slice(0, J).map((move) => () => agent(childPrompt(node, move), { label: `try:w${wave}:${node.changeId}`, phase: 'Search', agentType: 'operator', effort: 'high', schema: CHILD_SCHEMA }).then((r) => r && { ...r, parent: node.changeId, wave })),
  )
  const children = (await parallel(tasks)).filter(Boolean)
  allAttempts.push(...children)
  pool = [] // force a fresh brainstorm next wave

  const passing = children.filter((c) => c.gate === 'pass')
  log(`wave ${wave}: ${children.length} tried, ${passing.length} passed the gate`)
  if (!passing.length) { dryWaves++; continue }

  // Prune, durably: keep the best M as the new frontier; the rest stay as revisions.
  const candidates = [...passing, ...frontier]
  const nextFrontier = topM(candidates)
  const nextBest = bestOf(nextFrontier)
  if (better(nextBest.score, incumbent.score)) {
    incumbent = nextBest
    dryWaves = 0
    log(`wave ${wave}: new best ${incumbent.score} @ ${incumbent.changeId}`)
  } else {
    dryWaves++
    log(`wave ${wave}: no improvement (${dryWaves}/${convergenceK} dry)`)
  }
  frontier = nextFrontier
}

// --- Harvest: report the winning path; linearize by hand -------------------
phase('Harvest')
const passingAll = allAttempts.filter((a) => a.gate === 'pass')
const winner = bestOf([incumbent, ...passingAll]) || incumbent
const nearMisses = allAttempts
  .filter((a) => a.gate === 'fail' && Number.isFinite(a.score) && better(a.score, winner.score))
  .map((a) => ({ changeId: a.changeId, score: a.score, move: a.move }))
log(`winner: ${winner.changeId} score ${winner.score}; ${nearMisses.length} gate-failing near-misses worth a look`)

return {
  baseChangeId,
  winner,
  frontier,
  attempts: allAttempts,
  nearMisses,
  journalPath,
  harvestHint: `jj rebase the base→winner path (${baseChangeId} → ${winner.changeId}) into a linear stack; leave pruned siblings in the op log.`,
}
