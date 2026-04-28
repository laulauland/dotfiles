;;; early-init.el --- Early startup tweaks -*- lexical-binding: t; -*-

;;; Commentary:
;; Keep startup minimal and redirect generated native-comp files out of the
;; dotfiles-managed config directory.

;;; Code:

(setq package-enable-at-startup nil)

(defconst ll/emacs-cache-directory
  (file-name-as-directory
   (expand-file-name "emacs" (or (getenv "XDG_CACHE_HOME") "~/.cache"))))

(when (and (fboundp 'startup-redirect-eln-cache)
           (boundp 'native-comp-eln-load-path))
  (startup-redirect-eln-cache
   (expand-file-name "eln-cache/" ll/emacs-cache-directory)))

(when (fboundp 'menu-bar-mode) (menu-bar-mode -1))
(when (fboundp 'tool-bar-mode) (tool-bar-mode -1))
(when (fboundp 'scroll-bar-mode) (scroll-bar-mode -1))

;;; early-init.el ends here
