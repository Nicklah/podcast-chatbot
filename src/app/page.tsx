import Chat from "@/components/Chat";
import { episode, transcript } from "@/data/episode";
import { estimateTokens } from "@/lib/chat";

// A server component: it reads the transcript on the server and sends only the
// header text to the browser. The transcript itself never gets shipped to the
// client — it goes to Gemini from the API route.
export default function Home() {
  return (
    <main className="page">
      <header>
        <h1>{episode.title}</h1>
        <p className="show">
          {episode.show} · {episode.published} · ~{estimateTokens(transcript).toLocaleString()}{" "}
          tokens of transcript
        </p>
        <p className="note">
          Answers come only from this one episode&apos;s transcript. Ask about something it
          doesn&apos;t cover and it should tell you so rather than guess — that&apos;s the part
          worth testing.
        </p>
      </header>

      <Chat />

      <footer>
        Project 1 of a ten-project AI learning ramp. Built with Next.js and the Gemini API ·{" "}
        <a href="https://github.com/Nicklah/podcast-chatbot">source</a>
      </footer>
    </main>
  );
}
