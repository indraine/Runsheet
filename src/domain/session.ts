/** `graphics.session_type`. Hotlap and hotstint stay in the sheet, outside the type filter. */
export type SessionType = "practice" | "qualifying" | "race" | "hotlap" | "hotstint";

/** `live` while the player is on track. `closed` after the outing ends in the menu. */
export type SessionStatus = "live" | "closed";

export type Session = {
  id: string;
  outingId: string;
  /** Epoch ms from the local clock when the session opened. Not `graphics.clock`. */
  startedAt: number;
  /** Epoch ms when the outing closed. Null while `status` is `live`. */
  endedAt: number | null;
  /** `statics.is_online`. False is a solo run. */
  online: boolean;
  /** `statics.track`. A code; the track dictionary prints the name. */
  track: string;
  /** `statics.car_model`. A code; the car dictionary prints the name. */
  car: string;
  type: SessionType;
  /** Cars in the session, `graphics.active_cars`. */
  carCount: number;
  status: SessionStatus;
  /** Celsius, `physics.air_temp`. */
  airTemp: number;
  /** Celsius, `physics.road_temp`. */
  roadTemp: number;
};
