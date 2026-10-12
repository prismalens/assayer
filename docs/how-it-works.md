---
layout: page
title: How it works
---

## One round

1. Assayer reads the pull request with your `gh` login and refuses, before spending any quota, if it is closed, carries the `claude_review_skip` label, or already has a review from this engine on its head.
2. It checks out the head in a fresh directory and builds a manifest: which files changed and which of them are reviewable.
3. The engine runs over the [Agent Client Protocol](https://agentclientprotocol.com) with your own sign-in. It can read the checkout and run read-only commands. It gets no GitHub credential, and every edit or write it asks for is refused.
4. The engine records each finding and a summary through two tools. Assayer checks every finding before anything is posted: a body that looks like a credential is dropped, and a finding it cannot anchor to a changed line is posted as a plain comment instead.
5. With `--post`, the findings land as inline comments under your login, each ending in a hidden `assayer-finding` marker, and a summary comment gives the coverage.

## Closing the loop

Before reviewing a new head, Assayer re-checks the open threads it started:

- A thread whose file has not changed and that nobody answered stays open without a model call.
- The rest go back to the engine, which judges each one **fixed**, **still applies** or **cannot verify**.
- A fixed thread gets a one-line reply naming the commit and is resolved. The others get a reply only when someone is waiting on the reviewer.
- Threads that stay open are handed to the review as already raised, so the same finding is never posted twice.

GitHub has no conditional comment write or resolve. Assayer reads each thread again right before it writes, so the window is one request wide, not zero. A reply that lands inside it stays visible on the resolved thread, and anyone can reopen it.

## Whose name is on it

A local round posts under the `gh` login that ran it. There is no shared bot account. A finding is recognised as Assayer's by its marker, not by who posted it.
