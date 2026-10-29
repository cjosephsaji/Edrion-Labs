# VM drag control follow-up

The user reported that the “Drag VM ↗” button was confusing. It was a pointer drag source styled like a second Add button, with no moving VM preview.

The same control now resembles the existing VM cards and displays “New VM”, the model’s actual per-VM memory, and “Drag into memory”. A pointer-following preview and a highlighted memory target make the interaction visible. The target says “Release to test this VM”; it does not predict acceptance. Add one VM and the existing Enter fallback remain available. The allocation stays unchanged until an acknowledged operation returns.

Escape, pointer cancellation, lost capture, release outside memory, an editing lock, an accepted version change, a new attempt, or text-only mode dismiss the preview. No avatar or lesson/evaluation behavior changed.

Validation:

- Allocation lab: 19 tests passed, including touch drag, exactly one operation for a valid drop, no optimistic count change, Enter parity, three cancellation paths and editing-lock interruption.
- Student-web typecheck and focused ESLint passed; `git diff --check` passed.
- Visually inspected the live narrow Studio with the original avatar selected. A real pointer drag released outside memory left the current attempt predicted and the allocation at one VM / 8 GB used / 40 GB remaining. The user's attempt was not executed or reset.
- [Live Studio screenshot](vm-tile.png).

Earlier recordings and test receipts remain unchanged. This follow-up does not claim a new full-suite run or human accessibility acceptance.
