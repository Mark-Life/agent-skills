"""harness-doctor library package.

`audit.py` imports `lib.scan`, `lib.aggregate`, `lib.render`, and `lib.cost`,
which use relative imports between themselves, so this file marks the folder as
a package rather than a namespace dir. It is intentionally empty otherwise.
"""
