import wordmark from "~/assets/wordmark.svg";

export function Preloader() {
  return (
    <div class="flex min-h-screen items-center justify-center bg-white">
      <img src={wordmark} alt="Runsheet" class="h-24 animate-bounce" />
    </div>
  );
}
