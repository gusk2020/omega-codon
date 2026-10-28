# Stage 5.0 (Stage 1 of the integration plan): notes

- 1A time stall: leaps were held to 20000 yr while a past civilisation's residue lasted, and to <=4000 yr while a civilisation lived. Both caps now grow with elapsed time (world.js, civilization.js).
- 1B rank: gamma additionally needs one tier-2 axis; continuity tiers 150/250/450/1200/4000 (top tier and the Omega condition unchanged). Basis: individual records reach ~240 steps in 30000 steps.
- 1C KNOWN LIMITATION (deferred by the user): restoring a save replays every operation, so restore time is about the original run time (40000 steps: 18 s to run, 20 s to restore). Checkpoints are not implemented.
- Tests: test50.js (time progression past +309 Myr with speed switching and stop/resume, >400 events, restore equality, rank).
