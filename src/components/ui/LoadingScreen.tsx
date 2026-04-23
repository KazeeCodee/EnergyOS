import { useEffect, useState } from "react";
import { Logo } from "./Logo";

export function LoadingScreen({
  messages,
  onComplete,
}: {
  messages: string[];
  onComplete?: () => void;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timers = messages.map((_, messageIndex) =>
      window.setTimeout(() => setIndex(messageIndex), messageIndex * 500),
    );
    const done = window.setTimeout(() => onComplete?.(), messages.length * 500);

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(done);
    };
  }, [messages, onComplete]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-navy text-center">
      <Logo />
      <div className="mt-8 h-12 w-12 animate-spin rounded-full border-2 border-navy-border border-t-forest" />
      <p className="mt-5 text-sm text-mist">{messages[index]}</p>
    </div>
  );
}
