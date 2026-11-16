import { useReducer } from "react";
import { useLingui } from "@lingui/react/macro";
import { Input } from "../../components/ui/input";

type TopicChoice = { id: string; title: string; parent?: string };

export function TopicSearch({ topics, byId, onChoose, onCancel }: {
  topics: readonly TopicChoice[]; byId: ReadonlyMap<string, TopicChoice>;
  onChoose: (topic: TopicChoice) => void; onCancel: () => void;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useReducer((_: string, value: string) => value, "");
  const phrase = query.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const words = [...new Set(phrase.split(" ").filter(Boolean))];
  const phraseMatches: TopicChoice[] = [];
  const wordMatches: TopicChoice[] = [];
  let exact: TopicChoice | undefined;
  let matchCount = 0;
  for (const topic of topics) {
    const title = topic.title.toLocaleLowerCase();
    if (!words.every((word) => title.includes(word))) continue;
    matchCount++;
    if (title === phrase && !exact) { exact = topic; continue; }
    const group = title.includes(phrase) ? phraseMatches : wordMatches;
    if (group.length < 12) group.push(topic);
  }
  const matches = [...(exact ? [exact] : []), ...phraseMatches, ...wordMatches].slice(0, 12);
  return <div className="research-map-topic-search nopan nowheel" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); onCancel(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".research-map-topic-results button")];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const next = index < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1)
      : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].scrollIntoView?.({ block: "nearest" });
  }}>
    <Input autoFocus aria-label={t`Find topic`} placeholder={t`Find topic`} controlSize="compact" value={query}
      onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        } else if (event.key === "Enter" && matches[0]) {
          event.preventDefault();
          onChoose(matches[0]);
        }
      }} />
    <div className="research-map-topic-results">
      {matches.map((topic) => <button type="button" key={topic.id} onClick={() => onChoose(topic)}>
        <span>{topic.title}</span>
        {topic.parent && <small>{byId.get(topic.parent)?.title}</small>}
      </button>)}
      {!matches.length && <p>{t`No matching topics`}</p>}
      {matchCount > matches.length && <p>{t`Type to narrow the results`}</p>}
    </div>
  </div>;
}
