"use client";

import { useState } from "react";
import type { FamilyIndex } from "@/lib/graph";
import { buildQuiz, type QuizQuestion } from "@/lib/quiz";
import { Avatar, lifespan } from "./Avatar";
import { primaryButton, secondaryButton } from "./ui";

function verdict(score: number, total: number): string {
  const share = score / total;
  if (share === 1) return "A perfect round. You know this family inside out.";
  if (share >= 0.7) return "Nicely done. You know your relatives well.";
  if (share >= 0.4) return "A good start. Another round will help it stick.";
  return "Plenty of relatives still to get to know. Try another round.";
}

/**
 * Who's Who: a short round of multiple-choice questions about the people in
 * the tree. Nothing is saved; it only reads the tree, so guests can play too.
 */
export function QuizDialog({
  index,
  meId,
  onClose,
  onShowPerson,
}: {
  index: FamilyIndex;
  meId: string | null;
  onClose(): void;
  /** Leave the quiz and show this person in the tree. */
  onShowPerson(id: string): void;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => buildQuiz(index, meId));
  const [step, setStep] = useState(0);
  /** The choice made on the current question; null until they answer. */
  const [picked, setPicked] = useState<string | null>(null);
  const [missed, setMissed] = useState<QuizQuestion[]>([]);
  const [score, setScore] = useState(0);

  const question: QuizQuestion | undefined = questions[step];
  const finished = questions.length > 0 && step >= questions.length;
  const subject = question ? index.byId.get(question.subjectId) : undefined;

  const answer = (key: string) => {
    if (!question || picked !== null) return;
    setPicked(key);
    if (key === question.answer) setScore((n) => n + 1);
    else setMissed((list) => [...list, question]);
  };

  const next = () => {
    setPicked(null);
    setStep((n) => n + 1);
  };

  const playAgain = () => {
    setQuestions(buildQuiz(index, meId));
    setStep(0);
    setPicked(null);
    setMissed([]);
    setScore(0);
  };

  const chooseMeHint = !meId && (
    <p className="text-xs text-muted">
      Choose who you are under <strong className="font-semibold">I am</strong> in the ⋯ menu to also get questions about
      how everyone is related to you.
    </p>
  );

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Who’s Who quiz"
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-2">
          <h2 className="font-display text-2xl font-semibold text-ink">Who’s Who</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 pb-6">
          {questions.length === 0 ? (
            <>
              <p className="text-sm text-ink">
                There isn’t enough in the tree to make a quiz yet. It needs at least four people, plus any of these:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                <li>photos of people, for “Who is this?”</li>
                <li>parents linked to their children, for “Who is their mother?”</li>
                {!meId && <li>who you are (“I am” in the ⋯ menu), for “How are they related to you?”</li>}
              </ul>
              <button type="button" onClick={onClose} className={primaryButton}>
                Close
              </button>
            </>
          ) : finished ? (
            <>
              <div className="rounded-2xl bg-leaf-soft px-4 py-5 text-center">
                <p className="font-display text-4xl font-semibold text-leaf-dark">
                  {score} <span className="text-2xl font-normal">of</span> {questions.length}
                </p>
                <p className="mt-1 text-sm text-leaf-dark">{verdict(score, questions.length)}</p>
              </div>

              {missed.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Worth another look</h3>
                  <p className="mt-0.5 text-xs text-muted">Tap someone to find them in the tree.</p>
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                    {missed.map((q) => {
                      const person = index.byId.get(q.answerPersonId);
                      if (!person) return null;
                      return (
                        <li key={`${q.kind}:${q.subjectId}`}>
                          <button
                            type="button"
                            onClick={() => onShowPerson(person.id)}
                            className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-paper"
                          >
                            <Avatar person={person} size={40} />
                            <span className="min-w-0 flex-1 text-sm text-ink">{q.reveal}</span>
                            <span aria-hidden className="text-muted">
                              ›
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {chooseMeHint}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={playAgain} className={primaryButton}>
                  Play again
                </button>
                <button type="button" onClick={onClose} className={secondaryButton}>
                  Done
                </button>
              </div>
            </>
          ) : question ? (
            <>
              <div>
                <div className="flex items-baseline justify-between text-xs font-medium text-muted">
                  <span>
                    Question {step + 1} of {questions.length}
                  </span>
                  <span>
                    {score} right
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Progress through the quiz"
                  aria-valuemin={0}
                  aria-valuemax={questions.length}
                  aria-valuenow={step + (picked !== null ? 1 : 0)}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/60"
                >
                  <div
                    className="h-full rounded-full bg-leaf transition-[width] duration-300"
                    style={{ width: `${((step + (picked !== null ? 1 : 0)) / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Who the question is about. "Which of these is your aunt?" has nobody to show. */}
              {subject && question.kind === "face" && (
                <div className="flex justify-center pt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied photo */}
                  <img
                    src={subject.photo}
                    alt="Someone in the family"
                    draggable={false}
                    className="h-44 w-44 rounded-3xl border border-line object-cover shadow-sm"
                  />
                </div>
              )}
              {subject && (question.kind === "relation" || question.kind === "parent") && (
                <div className="flex flex-col items-center gap-1 pt-1 text-center">
                  <Avatar person={subject} size={88} />
                  <p className="text-xs text-muted">{lifespan(subject)}</p>
                </div>
              )}

              <h3 className="text-center font-display text-xl leading-snug font-semibold text-ink">{question.prompt}</h3>

              <div className="space-y-2">
                {question.options.map((option) => {
                  const person = option.personId ? index.byId.get(option.personId) : undefined;
                  const answered = picked !== null;
                  const right = option.key === question.answer;
                  const chosen = option.key === picked;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={answered}
                      onClick={() => answer(option.key)}
                      className={[
                        "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-2 text-left text-base font-medium",
                        !answered && "cursor-pointer border-line bg-white text-ink hover:border-leaf",
                        answered && right && "border-leaf bg-leaf-soft text-leaf-dark",
                        answered && !right && chosen && "border-clay bg-clay/10 text-clay",
                        answered && !right && !chosen && "border-line bg-white text-ink opacity-50",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {person && <Avatar person={person} size={36} />}
                      <span className="min-w-0 flex-1">{option.label}</span>
                      {answered && right && <span aria-label="Right answer">✓</span>}
                      {answered && !right && chosen && <span aria-label="Your answer">✕</span>}
                    </button>
                  );
                })}
              </div>

              <div aria-live="polite" className="min-h-10">
                {picked !== null && (
                  <p className="text-sm text-ink">
                    <strong className={picked === question.answer ? "font-semibold text-leaf-dark" : "font-semibold text-clay"}>
                      {picked === question.answer ? "That’s right." : "Not quite."}
                    </strong>{" "}
                    {question.reveal}
                  </p>
                )}
              </div>

              <button type="button" disabled={picked === null} onClick={next} className={`${primaryButton} w-full`}>
                {step + 1 === questions.length ? "See my score" : "Next"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
