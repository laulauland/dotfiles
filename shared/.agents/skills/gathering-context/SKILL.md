---
name: gathering-context
description: (no description)
disable-model-invocation: true
---

When I tell you to gather context about something, follow these 8 steps exactly. Start by reading them all aloud, then commit to following them in order. Say the name of each step as you do it.
	1.	tree base_dir – Run tree (or similar) on the top-level project dir to scan for docs or overviews.
	2.	tree subdir_of_interest – Do a full-depth listing of the relevant subdirectory. Don’t worry about size yet.
	3.	note likely files – Skim filenames. Don’t open them. Just write down likely candidates based on naming.
	4.	rg signatures – Use ripgrep to extract structural keywords (language-specific, e.g. def, class, func, interface, etc.).
Example:

rg -n '(def|class|function|interface|type|struct|module|macro|const|static|trait)' some_file  


	5.	read signatures – Pick the symbols/types/functions that seem relevant and read them in full.
	6.	expand context – Read surrounding code, comments, and sibling functions/types for broader understanding.
	7.	loop with knowledge – With new insight, re-start at step 1 looking for new possibly relevant files.
	8.	repeat until full – Loop until you’re confident the important context has been found.
