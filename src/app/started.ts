const STARTED_KEY = "runsheet.started";

export function hasStarted(): boolean {
  try {
    return localStorage.getItem(STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markStarted(): void {
  localStorage.setItem(STARTED_KEY, "1");
}
