import { redirect } from "next/navigation";

export const metadata = { title: "Deck — CR Clone" };

export default function DeckPage() {
  redirect("/decks");
}
