---
name: handleSaveChanges variable names in LockerOptionsDialog
description: Correct variable names to use inside handleSaveChanges vs wrong names that cause ReferenceError
---

**Rule:** Inside `handleSaveChanges` in `LockerOptionsDialog.tsx`, use `isStaff` (React state, line ~153), NOT `currentIsStaff` (a prop-like name that does not exist).

**Why:** The `onApply` call at the end of `handleSaveChanges` takes `isStaff` as the last argument. Using `currentIsStaff` throws a ReferenceError at argument evaluation time, so `onApply` is never called — data silently not saved, dialog still closes due to try-catch.

**How to apply:** Any future edit to the `onApply(...)` call in `handleSaveChanges` must use the local state variable `isStaff`, not `currentIsStaff`.
