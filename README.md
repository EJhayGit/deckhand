# Deckhand

A Claude Code mod: a deck of reusable agents beside the chat, with clickable
chips for model, effort, limits and repeat.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install deckhand --marketplace EJhayGit/deckhand
```

Answer `y` to add the marketplace, then pick a scope (user scope is first).

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt
box, then **Plugins**, **Add marketplace** with `EJhayGit/deckhand`, then
**Add plugin**.

A **Deck** panel opens beside the chat.

## Develop

Run it from this folder for one session:

```
claude --plugin-dir .
```

Checks:

```
claude plugin validate .
tsc -p .
claude plugin test .
```
