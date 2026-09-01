import type { Episode } from "@/lib/chat";

/**
 * REPLACE THIS with an episode of a podcast you actually listen to.
 *
 * How: find the show's transcript (many publish one; otherwise Whisper or
 * YouTube's auto-captions will give you text), paste it into `transcript`
 * below, and update `episode`. Keep the blank line between paragraphs —
 * fitTranscript uses them to avoid cutting someone off mid-sentence.
 *
 * What is here now is a made-up episode of a made-up show, written for this
 * repo so it runs out of the box with nothing to download. Nobody said any of
 * this.
 */

export const episode: Episode = {
  show: "The Long Rise (sample)",
  title: "Mira Osei on running a bakery that almost closed",
  published: "12 March 2026",
};

export const transcript = `
[00:00] HOST: Welcome back to The Long Rise. I'm here with Mira Osei, who runs Fenwick Street Bakery in Leeds. Mira, thanks for coming on.

[00:12] MIRA: Thanks for having me. It's nice to sit down, honestly. I don't do a lot of that.

[00:18] HOST: Let's start where everyone starts. The sourdough starter. People are intimidated by it.

[00:25] MIRA: They should be less intimidated and more patient. That's the whole thing. A starter takes about two weeks before it's reliable — you'll get bubbles on day three and think you've done it, and you haven't. Day three is bacteria, not yeast. It smells wrong. If you bake with it you get a flat, slightly cheesy loaf and you decide sourdough isn't for you. Wait the two weeks.

[01:02] HOST: And you feed it how often?

[01:05] MIRA: Twice a day once it's going, equal weights flour and water. I use rye for the first week because it ferments faster and gets you through the ugly stage quicker.

[01:20] HOST: I want to talk about the money, because you've been unusually open about this.

[01:26] MIRA: Yeah. We nearly closed in 2023. I'll say the actual number: we were four thousand pounds from not making rent in November. What saved us wasn't a loan, it was finally putting the prices up.

[01:44] HOST: You'd been underpricing.

[01:47] MIRA: Massively. A loaf was three pounds twenty. It cost us two pounds ten to make when you count labour properly — and most small bakeries do not count labour properly, they count flour. We moved to five pounds. I was sick about it for a week.

[02:08] HOST: What happened?

[02:10] MIRA: We lost maybe one customer in twenty. Revenue went up about forty percent. The thing nobody tells you is that the customers who leave over a pound eighty were never the ones keeping you open. I'd spent two years protecting a relationship that only existed in my head.

[02:32] HOST: Is that the biggest mistake you made?

[02:35] MIRA: No. The biggest one was hiring for enthusiasm. I hired four people in a row who loved bread and had never worked a service job. Baking at four in the morning is not a hobby, it's a shift. Now I hire people who've done hospitality and teach them the bread. Bread is teachable. Turning up at four is not.

[03:04] HOST: How many staff now?

[03:06] MIRA: Six, plus me. Three bakers, three front of house.

[03:14] HOST: What would you tell someone opening one next year?

[03:18] MIRA: Work in someone else's bakery for six months first, even unpaid if you can afford it, and specifically work the closing shift. Anyone can romanticise the opening. The closing shift is where you find out what the business actually costs. And write down your prices before you fall in love with your customers.

[03:42] HOST: Mira, thank you.

[03:44] MIRA: Thanks. Come by on a Saturday, the rye is better on Saturdays.
`.trim();
