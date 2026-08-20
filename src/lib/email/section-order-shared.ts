/**
 * Index at which the email's footer begins — the trailing run of recurring
 * sections, which is the sign-off and the board roster.
 *
 * New content goes *above* it. Appending at the end of the email instead puts
 * Thursday's late spirit-night notice underneath "Thanks again, Draper
 * Elementary PTA Board". Only the trailing run counts: a recurring block the
 * secretary deliberately dragged into the middle is not the footer and stays
 * where she put it.
 *
 * Client-safe, because the section list has to insert a new section at the same
 * place the server just filed it — an optimistic append would show her an order
 * the email doesn't have.
 */
export function footerStartIndex(
  sections: ReadonlyArray<{ recurringKey: string | null }>
): number {
  let i = sections.length;
  while (i > 0 && sections[i - 1].recurringKey) i--;
  return i;
}
