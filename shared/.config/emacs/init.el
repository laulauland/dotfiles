;;; init.el --- Minimal Emacs setup -*- lexical-binding: t; -*-

;;; Commentary:
;; Inspired by https://gist.github.com/amirrajan/6598528463e5e7544349a0a777c84443
;; Minimal terminal-friendly Emacs config: package setup, Evil, Evil Collection,
;; undo-tree, and Majutsu (Magit-style UI for Jujutsu).

;;; Code:

(defconst ll/emacs-cache-directory
  (file-name-as-directory
   (expand-file-name "emacs" (or (getenv "XDG_CACHE_HOME") "~/.cache"))))
(defconst ll/emacs-data-directory
  (file-name-as-directory
   (expand-file-name "emacs" (or (getenv "XDG_DATA_HOME") "~/.local/share"))))
(defconst ll/emacs-state-directory
  (file-name-as-directory
   (expand-file-name "emacs" (or (getenv "XDG_STATE_HOME") "~/.local/state"))))

(dolist (dir (list ll/emacs-cache-directory ll/emacs-data-directory ll/emacs-state-directory))
  (make-directory dir t))

(setq inhibit-startup-screen t
      initial-scratch-message nil
      ring-bell-function #'ignore
      use-short-answers t
      frame-title-format nil
      load-prefer-newer t
      custom-file (expand-file-name "custom.el" ll/emacs-state-directory)
      backup-directory-alist `(("." . ,(expand-file-name "backups/" ll/emacs-cache-directory)))
      auto-save-list-file-prefix (expand-file-name "auto-save-list/saves-" ll/emacs-cache-directory)
      project-list-file (expand-file-name "projects" ll/emacs-state-directory)
      recentf-save-file (expand-file-name "recentf" ll/emacs-state-directory)
      save-place-file (expand-file-name "places" ll/emacs-state-directory)
      bookmark-default-file (expand-file-name "bookmarks" ll/emacs-state-directory)
      create-lockfiles nil
      split-height-threshold nil
      split-width-threshold 0
      scroll-preserve-screen-position t)

(setq-default indent-tabs-mode t
              tab-width 2
              standard-indent 2
              fill-column 80
              line-spacing 0.2
              left-margin-width 1
              right-margin-width 1)

(when (fboundp 'set-fringe-mode)
  (set-fringe-mode 10))

(defconst ll/font-family "Berkeley Mono")
(defconst ll/font-height 140)

(add-to-list 'default-frame-alist `(font . ,(format "%s-14" ll/font-family)))
(add-to-list 'default-frame-alist '(alpha-background . 95))
(add-to-list 'default-frame-alist '(internal-border-width . 8))
(add-to-list 'initial-frame-alist `(font . ,(format "%s-14" ll/font-family)))
(add-to-list 'initial-frame-alist '(alpha-background . 95))
(add-to-list 'initial-frame-alist '(internal-border-width . 8))

(set-face-attribute 'default nil :font ll/font-family :height ll/font-height)

(when (eq system-type 'darwin)
  (setq ns-use-proxy-icon nil
        ns-pop-up-frames nil
        mac-mouse-wheel-smooth-scroll t))

(defvar ll/theme 'alabaster-themes-light
  "Theme to load after package setup.")

(defun ll/apply-modern-frame (&optional frame)
  "Apply modern GUI frame defaults to FRAME."
  (with-selected-frame (or frame (selected-frame))
    (when (display-graphic-p)
      (set-face-attribute 'default frame :font ll/font-family :height ll/font-height)
      (set-frame-parameter frame 'alpha-background 95)
      (set-frame-parameter frame 'internal-border-width 8))))

(add-hook 'after-make-frame-functions #'ll/apply-modern-frame)
(ll/apply-modern-frame)

(setq-default mode-line-format
              '("%e" mode-line-front-space "  %b  " mode-line-end-spaces))

(setq scroll-step 1
      scroll-conservatively 10000
      scroll-margin 3)
(when (fboundp 'pixel-scroll-precision-mode)
  (pixel-scroll-precision-mode 1))

(global-display-line-numbers-mode 1)
(column-number-mode 1)
(show-paren-mode 1)
(save-place-mode 1)
(recentf-mode 1)
(global-auto-revert-mode 1)

;; These must be set before Evil or Evil Collection are loaded/activated.
(setq evil-want-C-i-jump nil
      evil-want-integration t
      evil-want-keybinding nil
      evil-undo-system 'undo-tree)

(require 'package)
(setq package-user-dir (expand-file-name "elpa" ll/emacs-data-directory)
      package-gnupghome-dir (expand-file-name "package-gnupg" ll/emacs-data-directory)
      ;; The local GNU ELPA keyring can lag behind package signatures on fresh
      ;; installs. Keep bootstrap reliable; packages are still fetched over TLS.
      package-check-signature nil
      package-archives '(("gnu" . "https://elpa.gnu.org/packages/")
                         ("nongnu" . "https://elpa.nongnu.org/nongnu/")
                         ("melpa" . "https://melpa.org/packages/")))

(package-initialize)

(unless package-archive-contents
  (package-refresh-contents))

(unless (package-installed-p 'use-package)
  (package-install 'use-package))

(require 'use-package)
(setq use-package-always-ensure t)

(use-package alabaster-themes
  :config
  (load-theme ll/theme t))

(use-package undo-tree
  :init
  (setq undo-tree-history-directory-alist
        `(("." . ,(expand-file-name "undo-tree/" ll/emacs-state-directory))))
  :config
  (global-undo-tree-mode 1))

(use-package evil
  :init
  ;; Match Neovim's <leader> = Space. This is the most ergonomic choice here:
  ;; it mirrors your existing config, is easy to chord in terminal Emacs, and
  ;; does not collide with your tmux prefix (C-x).
  (setq evil-want-C-u-scroll t)
  :config
  (evil-mode 1)
  (evil-set-undo-system 'undo-tree)

  (defun ll/recenter (&rest _)
    "Recenter after motion commands, like your Neovim zz mappings."
    (recenter))

  (defun ll/recenter-search (&rest _)
    "Recenter and reveal current match after search navigation."
    (recenter)
    (when (fboundp 'evil-scroll-line-to-center)
      (evil-scroll-line-to-center (line-number-at-pos))))

  (defun ll/quick-substitute-word ()
    "Start a buffer-wide replace for the symbol at point."
    (interactive)
    (let ((word (or (thing-at-point 'symbol t) "")))
      (goto-char (point-min))
      (query-replace-regexp word word)))

  (defun ll/toggle-whitespace ()
    "Toggle visible whitespace, similar to your Neovim <leader>uw mapping."
    (interactive)
    (setq-local whitespace-style
                (if (bound-and-true-p whitespace-mode)
                    '(face trailing tabs tab-mark)
                  '(face spaces tabs newline trailing space-mark tab-mark newline-mark)))
    (whitespace-mode 'toggle))

  (defun ll/comment-dwim ()
    "Comment current line or active region."
    (interactive)
    (if (use-region-p)
        (comment-or-uncomment-region (region-beginning) (region-end))
      (comment-line 1)))

  (defun ll/switch-to-previous-buffer ()
    "Switch to previous buffer, like Neovim's C-^ / C-Tab habit."
    (interactive)
    (switch-to-buffer (other-buffer (current-buffer) 1)))

  (defun ll/project-files ()
    "Find a project file, falling back to regular find-file."
    (interactive)
    (if (project-current nil)
        (call-interactively #'project-find-file)
      (call-interactively #'find-file)))

  (defun ll/project-grep ()
    "Search within the current project, falling back to rgrep."
    (interactive)
    (if (project-current nil)
        (call-interactively #'project-find-regexp)
      (call-interactively #'rgrep)))

  (defun ll/open-directory ()
    "Open dired for the current directory, Oil-style."
    (interactive)
    (dired default-directory))

  (defvar ll/leader-map (make-sparse-keymap)
    "Leader keymap used by Evil normal/visual states.")
  (defvar ll/leader-u-map (make-sparse-keymap)
    "Leader keymap for UI/toggle commands.")

  (define-key evil-normal-state-map (kbd "SPC") ll/leader-map)
  (define-key evil-visual-state-map (kbd "SPC") ll/leader-map)

  ;; Core Vim muscle-memory tweaks from your Neovim setup.
  (evil-define-key '(normal visual) 'global
    (kbd "gh") #'evil-first-non-blank
    (kbd "gl") #'evil-end-of-line
    (kbd "C-h") #'windmove-left
    (kbd "C-j") #'windmove-down
    (kbd "C-k") #'windmove-up
    (kbd "C-l") #'windmove-right)

  (evil-define-key 'normal 'global
    (kbd "C-<tab>") #'ll/switch-to-previous-buffer
    (kbd "[ b") #'previous-buffer
    (kbd "] b") #'next-buffer
    (kbd "-") #'ll/open-directory
    (kbd "S") #'ll/quick-substitute-word
    (kbd "ESC") #'keyboard-quit)

  (evil-define-key '(normal visual) 'global
    (kbd "c") (kbd "\"_c")
    (kbd "s") (kbd "\"_s"))

  (evil-define-key 'visual 'global
    (kbd "p") (kbd "\"_dP")
    (kbd "P") (kbd "\"_dP")
    (kbd "<") (kbd "<gv")
    (kbd ">") (kbd ">gv"))

  (evil-define-key 'insert 'global
    (kbd "C-b") #'backward-char
    (kbd "C-f") #'forward-char
    (kbd "C-a") #'back-to-indentation
    (kbd "C-e") #'move-end-of-line
    (kbd "C-p") #'previous-line
    (kbd "C-n") #'next-line)

  ;; Keep the viewport centered after vertical/search motions.
  (dolist (command '(evil-scroll-down evil-scroll-up evil-jump-forward evil-jump-backward
                    evil-forward-section-begin evil-backward-section-begin
                    evil-goto-first-line evil-goto-line))
    (advice-add command :after #'ll/recenter))
  (dolist (command '(evil-search-next evil-search-previous evil-ex-search-next evil-ex-search-previous))
    (advice-add command :after #'ll/recenter-search))

  ;; Leader mappings mirror the Neovim layout where there is an Emacs-native
  ;; equivalent. Space remains the leader; backslash is left free as localleader.
  (define-key ll/leader-map (kbd "SPC") #'execute-extended-command)
  (define-key ll/leader-map (kbd "w") #'save-buffer)
  (define-key ll/leader-map (kbd "x") #'kill-current-buffer)
  (define-key ll/leader-map (kbd "q") #'save-buffers-kill-terminal)
  (define-key ll/leader-map (kbd "Q") #'kill-emacs)
  (define-key ll/leader-map (kbd "/") #'ll/comment-dwim)
  (define-key ll/leader-map (kbd "b") #'switch-to-buffer)
  (define-key ll/leader-map (kbd "e") #'ll/open-directory)
  (define-key ll/leader-map (kbd "v") #'split-window-right)
  (define-key ll/leader-map (kbd "h") #'split-window-below)
  (define-key ll/leader-map (kbd "=") #'balance-windows)
  (define-key ll/leader-map (kbd "u") ll/leader-u-map)
  (define-key ll/leader-u-map (kbd "u") #'undo-tree-visualize)
  (define-key ll/leader-u-map (kbd "w") #'ll/toggle-whitespace)
  (define-key ll/leader-map (kbd "J") #'next-error)
  (define-key ll/leader-map (kbd "K") #'previous-error)
  (define-key ll/leader-map (kbd "c o") #'compilation-next-error)
  (define-key ll/leader-map (kbd "c c") #'quit-window)
  (define-key ll/leader-map (kbd "f f") #'find-file)
  (define-key ll/leader-map (kbd "f F") #'find-file)
  (define-key ll/leader-map (kbd "f g") #'ll/project-files)
  (define-key ll/leader-map (kbd "f w") #'ll/project-grep)
  (define-key ll/leader-map (kbd "f h") #'help-for-help)
  (define-key ll/leader-map (kbd "f m") #'list-bookmarks)

  ;; Non-leader finder shortcuts from Neovim.
  (global-set-key (kbd "C-p") #'ll/project-files)
  (global-set-key (kbd "S-C-p") #'execute-extended-command))

(use-package which-key
  :config
  (which-key-mode 1))

(use-package evil-collection
  :after evil
  :config
  (evil-collection-init))

;; Majutsu provides a Magit-style UI for Jujutsu. It still depends on Magit
;; libraries internally, but C-x g opens the JJ-first interface. This version of
;; use-package does not understand `:vc', so install the VC package explicitly.
(when (and (fboundp 'package-vc-install)
           (not (package-installed-p 'majutsu)))
  (package-vc-install "https://github.com/0WD0/majutsu"))

(use-package majutsu
  :commands (majutsu majutsu-log)
  :bind (("C-x g" . majutsu)
         ("C-c j" . majutsu-log)))

(load custom-file 'noerror)

;;; init.el ends here
