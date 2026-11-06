# User Guide

How to run a tournament day with the app.

## Before the tournament (admin)

Sign in at `/login` with the admin credentials from `.env`. The dashboard has these tabs:

1. **Groups**: add, rename or delete groups (e.g. *Group A - Mens*, *Group B - Mens*, *Group C - Womens*) and the pools inside them (*Pool 1*, *Pool 2*). Teams are ranked within their pool; a group with no pools is ranked as a single table. A group or pool that still has teams can't be deleted. Adding the first pool to a group moves that group's existing teams into it.
2. **Teams**: add each doubles team (team name and two players) and pick its group, and its pool if the group has pools.
3. **Matches**: pick a group (and pool), then two teams from it, and optionally a start time such as *7:15 PM*. Matches start as *upcoming*.
4. **Referees**: create a login (name, username, password) for each referee and optionally assign them to a court.
5. **Courts**: add, rename or delete courts, assign matches to a court's queue and reorder it with ↑/↓, and assign a referee to each court. A court with queued or live matches can't be deleted.
6. **Approvals**: lists any match-completion requests that are waiting for admin approval.
7. **Stats**: leaderboards and pool winners (see [How rankings work](#how-rankings-work)).

Open `/live` on a TV or projector so players can follow along.

## During a match (referee)

1. Sign in at `/login` and choose the **Referee** tab (or open `/login?role=referee`). You'll see the queue for your assigned court.
2. Tap **Start Match** on the next match. It becomes *live*.
   - The **court view** shows the court from above: which team is at the left and right end, each team's score, and who is serving. The server's service box is highlighted in lime and the receiver's box is outlined. As in real doubles, the server serves from the right box on an even score and the left box on an odd score.
   - Each player is shown in the service court they are standing in. The serving player is marked **Serving** (lime box) and the player diagonally opposite **Receiving**. Positions follow the doubles rules automatically: when the serving side wins a rally, its two players swap service courts and the same player serves again; the receiving side never moves; when the serve changes sides, the player in the court matching the new server's score serves (right court on even, left on odd). **Undo** puts players back as well.
   - Before the first point, set up the court: **Swap ends** puts each team at the end it is actually playing from, **Server** picks which side serves first, and **Swap positions** (under each end) swaps that team's two players, which decides who serves or receives first. You can use these later in the match too, for example to fix a mistake.
3. Tap the **+1 Point** button under a team's end for every rally that team wins.
   - **Rally scoring**: the team that wins the rally gets (or keeps) the serve. The 🏸 icon shows who is serving.
   - **Undo Last Point** reverses the last point in the current set and restores the serve.
4. When a set is over, tap **End Set** and choose the set winner.
   - Standard rule: **15 points with a 2-point lead, capped at 17** (for example 15-13, 16-14 or 17-16). The referee decides when the set ends, which also covers walkovers and retirements.
   - After a set ends, it's locked, the teams switch sides, and the set winner serves first in the next set.
5. A match is **best of 3 sets**. When a team wins its second set, the match completes automatically and the leaderboard updates straight away.
6. **Finish Match** ends a match early, for example after a retirement. The team that has won more sets wins. If both teams have won the same number of sets, the app asks you to end the current set first, so a match can never finish without a winner.

## Semi-finals and finals

Each group ends with a knockout: **Pool 1 1st vs Pool 2 2nd** and **Pool 1 2nd vs Pool 2 1st**, and the two winners play the final. Groups without pools (e.g. *Group C - Womens*) just have two semi-finals and a final.

1. When the pool matches are done, check the standings in **Stats** (edit them if needed, see below).
2. In **Matches → Semi-finals & Finals**, tap **Create Semi-finals** for the group. The four teams are filled in from the standings; change any team if needed, then **Save**.
3. Assign the semi-finals to courts in the **Courts** tab. Referees score them as usual.
4. When both semi-finals are completed and approved, tap **Create Final**. The two winners are filled in automatically.
5. You can also schedule a semi-final or final by hand: in the **Schedule New Match** form pick **Semi-final** or **Final** as the match type (any two teams of the group, optional name).

Semi-final and final results **don't change the pool standings**. Everyone can follow the knockouts in the **Bracket** tab of the live scoreboard (`/live?tab=bracket`): Semi-final 1 at the top, Semi-final 2 at the bottom, and the final with the group champion in the middle.

## Admin corrections

- **Edit a match result**: in **Matches**, tap **Enter Result** (upcoming match) or **Edit Result** (completed match), enter the set scores and pick the winner. The winner defaults to the team that won more sets; choose the other team for a walkover or retirement. Standings are recalculated. If you change a semi-final winner before the final has started, the final is updated too. Live matches can't be edited.
- **Edit standings**: in **Stats**, tap **Edit** on a pool table. Use the arrows to set positions and edit W / L / Pts. A pool with manual positions shows a **Manual** badge, and edited numbers show ✎. **Reset to automatic** removes your changes and goes back to the numbers from match results. Semi-finals are filled from these standings.

## How rankings work

Pool standings follow the BWF group-stage rules. Only **completed pool matches** count (not semi-finals or finals), and the numbers are always worked out from the match results, so they stay correct even if a match is deleted, edited or a button is tapped twice.

Each table shows **P** (played), **W** (won), **L** (lost), **Sets ±** (sets won − sets lost) and **Pts ±** (rally points scored − conceded). Teams are ranked by:

1. **Matches won.**
2. **Two teams tied:** the winner of the match between them goes above.
3. **Three or more teams tied:** set difference, then point difference. Whenever exactly two teams are still tied, the result of the match between them decides.
4. Anything still tied: total points scored, then name.

Badminton has no draws, so there are no league points (a "win = 2 points" table would rank teams exactly the same as counting wins).

An admin can override the table in **Stats → Edit** (positions, W, L, Sets ±, Pts ±). Manual positions always win; **Reset to automatic** removes the edits. Semi-finals are seeded from these standings.

## Resetting

Tap **Reset** in the admin dashboard header and pick one of two options. Both ask for the reset password (`VITE_RESET_PASSWORD`) and can't be undone.

- **Reset scores only**: every match goes back to *upcoming* at 0–0 (sets, undo history, winners and pending approvals are cleared), and team stats, manual positions and edited numbers go back to zero. **Groups, pools, teams, matches (with their court and queue order), courts and referees are kept.** Use this to replay the same fixture, e.g. after a test run.
- **Reset everything**: deletes all teams, groups, pools, courts, matches and referee accounts, leaving an empty app. You also have to type `RESET`. To load the Season 2 fixture again afterwards, run `database-migrations/02-seed-cubet-season-2.sql`.
