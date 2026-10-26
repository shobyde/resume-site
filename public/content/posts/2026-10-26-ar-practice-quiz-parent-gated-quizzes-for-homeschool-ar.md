# AR Practice Quiz: Parent-Gated Quizzes for Homeschool AR
Tag: project
Subtitle: An AR homeschool quiz app where a parent approves AI-generated quizzes before kids take them, and passing awards Accelerated Reader points.
---
I built the AR Practice Quiz because my kids read books at home and I wanted the quiz-and-points loop that school AR programs provide without depending on the school's catalog. The constraint that drove most of the design was simple: a model should never be the thing that decides what a child sees.

The core flow is parent-gated. A parent searches AR BookFind via arfetch.py, picks a book, and the app calls GLM (glm-5.3-flash through opencode-go, see OPENCODE_BASE) to generate five comprehension questions with a quiz_and_points pass threshold defaulting to 0.6. The quiz lands in arquiz.db as a draft row. Kids only ever see approved quizzes. The review_quiz route in app.py is where the parent edits or rejects questions before flipping the approved flag. That gate is the whole product. Without it the app is a quiz generator; with it the app is a homeschool tool.

State lives in SQLite. readers, books, attempts, quizzes. No ORM, just sqlite3 with a teardown_appcontext close_db. For a household of a few kids this is correct. I considered Postgres and it would have been wrong: backup is copying one file, debugging is opening sqlite3, and the failure mode of a corrupted db is "restore yesterday's copy."

The reward side is where I spent the most judgment. attempt_stars returns 0-3 stars based on score ratio. reward_level computes milestone progress against either a teacher-set goal or a default ladder [25, 50, 100, ...]. all_stickers collects every passed book as a sticker with a deterministic icon and color derived from book id. earned_badges tracks "First finish" and similar unlocks. None of this is necessary for learning. It is necessary for a seven-year-old to want to take the next quiz. The trade-off is that the points are arbitrary; I picked thresholds that feel rewarding, not ones backed by pedagogy research.

What I would change: the model call has no retry or fallback if opencode-go is down, and OPENCODE_KEY is loaded from a dotfile at runtime via load_key. That works on my server but is fragile. I would also add a per-book duplicate check so the same title is not re-quiz'd. The app currently trusts the parent to notice.

The honest unresolved question is whether generated quizzes measure reading comprehension or pattern-matching. I do not have a way to tell yet. I watch which questions kids get wrong and rewrite them by hand when the model misfires.
