//! MoTeC i2 (`.ld`) encode/decode for Runsheet lap traces.
//!
//! Channel names follow common ACC MoTeC conventions so files open cleanly in
//! i2 / i2 Pro and round-trip through Runsheet import.

use std::io::{Read, Seek, Write};
#[cfg(test)]
use std::io::Cursor;

use motec_i2::{ChannelMetadata, Datatype, Header, LDReader, LDWriter, Sample};
use serde::{Deserialize, Serialize};

/// Fixed meta block offset used by [`LDWriter`].
const CHANNEL_META_PTR: u32 = 0x3448;
/// Size of one channel metadata record in a MoTeC `.ld` file.
const CHANNEL_META_ENTRY: u32 = 124;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MotecMeta {
    pub driver: String,
    pub vehicle: String,
    pub venue: String,
    pub session: String,
    pub comment: String,
    /// Unix epoch milliseconds used for header date/time strings.
    pub started_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MotecChannels {
    pub distance: Vec<f32>,
    pub time: Vec<f32>,
    pub speed: Vec<f32>,
    pub throttle: Vec<f32>,
    pub brake: Vec<f32>,
    pub steer: Vec<f32>,
    pub gear: Vec<f32>,
    pub g_long: Vec<f32>,
    pub g_lat: Vec<f32>,
    pub x: Vec<f32>,
    pub z: Vec<f32>,
    pub pressure_fl: Vec<f32>,
    pub pressure_fr: Vec<f32>,
    pub pressure_rl: Vec<f32>,
    pub pressure_rr: Vec<f32>,
    pub brake_temp_fl: Vec<f32>,
    pub brake_temp_fr: Vec<f32>,
    pub rpm: Vec<f32>,
    pub heading: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MotecLap {
    pub meta: MotecMeta,
    pub sample_rate_hz: u16,
    pub channels: MotecChannels,
}

#[derive(Debug, Clone, Copy)]
struct ChannelSpec {
    key: &'static str,
    name: &'static str,
    short_name: &'static str,
    unit: &'static str,
    /// Scale applied on export: Runsheet value → MoTeC file value.
    export_scale: f32,
    /// When true, imported values above 1.5 are treated as percent and divided by 100.
    percent_fraction: bool,
}

const CHANNELS: &[ChannelSpec] = &[
    ChannelSpec {
        key: "distance",
        name: "Lap Distance",
        short_name: "LapDist",
        unit: "m",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "speed",
        name: "Ground Speed",
        short_name: "Gnd Spd",
        unit: "km/h",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "throttle",
        name: "Throttle Pos",
        short_name: "Thr Pos",
        unit: "%",
        export_scale: 100.0,
        percent_fraction: true,
    },
    ChannelSpec {
        key: "brake",
        name: "Brake Pos",
        short_name: "Brk Pos",
        unit: "%",
        export_scale: 100.0,
        percent_fraction: true,
    },
    ChannelSpec {
        key: "steer",
        name: "Steering Angle",
        short_name: "Steer",
        unit: "deg",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "gear",
        name: "Gear",
        short_name: "Gear",
        unit: "",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "rpm",
        name: "Engine RPM",
        short_name: "RPM",
        unit: "rpm",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "gLat",
        name: "G Force Lat",
        short_name: "G Lat",
        unit: "G",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "gLong",
        name: "G Force Long",
        short_name: "G Long",
        unit: "G",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "x",
        name: "World Position X",
        short_name: "Pos X",
        unit: "m",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "z",
        name: "World Position Z",
        short_name: "Pos Z",
        unit: "m",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "pressureFl",
        name: "Tyre Pressure FL",
        short_name: "P FL",
        unit: "psi",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "pressureFr",
        name: "Tyre Pressure FR",
        short_name: "P FR",
        unit: "psi",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "pressureRl",
        name: "Tyre Pressure RL",
        short_name: "P RL",
        unit: "psi",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "pressureRr",
        name: "Tyre Pressure RR",
        short_name: "P RR",
        unit: "psi",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "brakeTempFl",
        name: "Brake Temp FL",
        short_name: "BT FL",
        unit: "C",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "brakeTempFr",
        name: "Brake Temp FR",
        short_name: "BT FR",
        unit: "C",
        export_scale: 1.0,
        percent_fraction: false,
    },
    ChannelSpec {
        key: "heading",
        name: "Heading",
        short_name: "Head",
        unit: "rad",
        export_scale: 1.0,
        percent_fraction: false,
    },
];

/// Write a MoTeC `.ld` for one lap into `sink`.
pub(crate) fn write_lap(sink: &mut (impl Write + Seek), lap: &MotecLap) -> Result<(), String> {
    let count = lap.channels.distance.len();
    if count == 0 {
        return Err("trace is empty".into());
    }
    assert_channel_lengths(&lap.channels, count)?;

    let rate = if lap.sample_rate_hz == 0 {
        estimate_rate_hz(&lap.channels.time)
    } else {
        lap.sample_rate_hz
    };

    let (date_string, time_string) = date_time_strings(lap.meta.started_at);
    let num_channels = CHANNELS.len() as u32;
    let header = Header {
        channel_meta_ptr: CHANNEL_META_PTR,
        channel_data_ptr: CHANNEL_META_PTR + num_channels * CHANNEL_META_ENTRY,
        event_ptr: 0,
        device_serial: 0,
        device_type: "Runsheet".into(),
        device_version: 100,
        num_channels,
        date_string,
        time_string,
        driver: lap.meta.driver.clone(),
        vehicleid: lap.meta.vehicle.clone(),
        venue: lap.meta.venue.clone(),
        session: lap.meta.session.clone(),
        short_comment: lap.meta.comment.clone(),
    };

    let mut writer = LDWriter::new(sink, header);
    for spec in CHANNELS {
        let values = channel_values(&lap.channels, spec.key)?;
        let samples: Vec<Sample> = values
            .iter()
            .map(|value| Sample::F32(value * spec.export_scale))
            .collect();
        writer = writer.with_channel(float_meta(spec, rate), samples);
    }
    writer.write().map_err(|error| error.to_string())
}

/// Read one MoTeC `.ld` into Runsheet channel layout.
pub(crate) fn read_lap(source: &mut (impl Read + Seek)) -> Result<MotecLap, String> {
    let mut reader = LDReader::new(source);
    let header = reader.read_header().map_err(|error| error.to_string())?;
    let file_channels = reader
        .read_channels()
        .map_err(|error| error.to_string())?;
    if file_channels.is_empty() {
        return Err("MoTeC file has no channels".into());
    }

    let sample_rate_hz = file_channels
        .iter()
        .map(|channel| channel.sample_rate)
        .filter(|rate| *rate > 0)
        .max()
        .unwrap_or(20);
    let sample_count = file_channels
        .iter()
        .map(|channel| channel.data_count as usize)
        .max()
        .unwrap_or(0);
    if sample_count == 0 {
        return Err("MoTeC channels have no samples".into());
    }

    let mut channels = empty_channels(sample_count);
    for file_channel in &file_channels {
        let Some(spec) = match_channel(&file_channel.name) else {
            continue;
        };
        let samples = reader
            .channel_data(file_channel)
            .map_err(|error| error.to_string())?;
        let decoded: Vec<f32> = samples
            .iter()
            .map(|sample| {
                let value = sample.decode_f64(file_channel) as f32;
                if spec.percent_fraction && value.abs() > 1.5 {
                    value / 100.0
                } else {
                    value
                }
            })
            .collect();
        set_channel(&mut channels, spec.key, pad_or_trim(decoded, sample_count))?;
    }

    if channels.time.iter().all(|value| *value == 0.0) {
        channels.time = synthesize_time_ms(sample_count, sample_rate_hz);
    }

    let started_at = parse_started_at(&header.date_string, &header.time_string)
        .unwrap_or_else(now_ms);

    Ok(MotecLap {
        meta: MotecMeta {
            driver: header.driver,
            vehicle: header.vehicleid,
            venue: header.venue,
            session: header.session,
            comment: header.short_comment,
            started_at,
        },
        sample_rate_hz,
        channels,
    })
}

/// Encode a lap to bytes (tests / callers that already own a path).
#[cfg(test)]
fn encode_bytes(lap: &MotecLap) -> Result<Vec<u8>, String> {
    let samples = lap.channels.distance.len();
    let size = CHANNEL_META_PTR as usize
        + CHANNELS.len() * CHANNEL_META_ENTRY as usize
        + CHANNELS.len() * samples * 4
        + 64;
    let mut cursor = Cursor::new(vec![0u8; size]);
    write_lap(&mut cursor, lap)?;
    Ok(cursor.into_inner())
}

/// Decode bytes produced by [`encode_bytes`] or a MoTeC file on disk.
#[cfg(test)]
fn decode_bytes(bytes: &[u8]) -> Result<MotecLap, String> {
    let mut cursor = Cursor::new(bytes);
    read_lap(&mut cursor)
}

pub(crate) fn estimate_rate_hz(time_ms: &[f32]) -> u16 {
    if time_ms.len() < 2 {
        return 20;
    }
    let first = time_ms[0];
    let last = time_ms[time_ms.len() - 1];
    let span = last - first;
    if !(span > 0.0) {
        return 20;
    }
    let hz = (time_ms.len() - 1) as f64 / (span as f64 / 1000.0);
    hz.round().clamp(1.0, 1_000.0) as u16
}

fn float_meta(spec: &ChannelSpec, sample_rate: u16) -> ChannelMetadata {
    ChannelMetadata {
        prev_addr: 0,
        next_addr: 0,
        data_addr: 0,
        data_count: 0,
        datatype: Datatype::F32,
        sample_rate,
        offset: 0,
        mul: 1,
        scale: 1,
        dec_places: 0,
        name: spec.name.into(),
        short_name: spec.short_name.into(),
        unit: spec.unit.into(),
    }
}

fn assert_channel_lengths(channels: &MotecChannels, count: usize) -> Result<(), String> {
    for (name, len) in [
        ("distance", channels.distance.len()),
        ("time", channels.time.len()),
        ("speed", channels.speed.len()),
        ("throttle", channels.throttle.len()),
        ("brake", channels.brake.len()),
        ("steer", channels.steer.len()),
        ("gear", channels.gear.len()),
        ("gLong", channels.g_long.len()),
        ("gLat", channels.g_lat.len()),
        ("x", channels.x.len()),
        ("z", channels.z.len()),
        ("pressureFl", channels.pressure_fl.len()),
        ("pressureFr", channels.pressure_fr.len()),
        ("pressureRl", channels.pressure_rl.len()),
        ("pressureRr", channels.pressure_rr.len()),
        ("brakeTempFl", channels.brake_temp_fl.len()),
        ("brakeTempFr", channels.brake_temp_fr.len()),
        ("rpm", channels.rpm.len()),
        ("heading", channels.heading.len()),
    ] {
        if len != count {
            return Err(format!(
                "channel {name} length {len} does not match distance length {count}"
            ));
        }
    }
    Ok(())
}

fn channel_values<'a>(channels: &'a MotecChannels, key: &str) -> Result<&'a [f32], String> {
    Ok(match key {
        "distance" => &channels.distance,
        "speed" => &channels.speed,
        "throttle" => &channels.throttle,
        "brake" => &channels.brake,
        "steer" => &channels.steer,
        "gear" => &channels.gear,
        "rpm" => &channels.rpm,
        "gLat" => &channels.g_lat,
        "gLong" => &channels.g_long,
        "x" => &channels.x,
        "z" => &channels.z,
        "pressureFl" => &channels.pressure_fl,
        "pressureFr" => &channels.pressure_fr,
        "pressureRl" => &channels.pressure_rl,
        "pressureRr" => &channels.pressure_rr,
        "brakeTempFl" => &channels.brake_temp_fl,
        "brakeTempFr" => &channels.brake_temp_fr,
        "heading" => &channels.heading,
        other => return Err(format!("unknown channel key {other}")),
    })
}

fn set_channel(channels: &mut MotecChannels, key: &str, values: Vec<f32>) -> Result<(), String> {
    match key {
        "distance" => channels.distance = values,
        "speed" => channels.speed = values,
        "throttle" => channels.throttle = values,
        "brake" => channels.brake = values,
        "steer" => channels.steer = values,
        "gear" => channels.gear = values,
        "rpm" => channels.rpm = values,
        "gLat" => channels.g_lat = values,
        "gLong" => channels.g_long = values,
        "x" => channels.x = values,
        "z" => channels.z = values,
        "pressureFl" => channels.pressure_fl = values,
        "pressureFr" => channels.pressure_fr = values,
        "pressureRl" => channels.pressure_rl = values,
        "pressureRr" => channels.pressure_rr = values,
        "brakeTempFl" => channels.brake_temp_fl = values,
        "brakeTempFr" => channels.brake_temp_fr = values,
        "heading" => channels.heading = values,
        "time" => channels.time = values,
        other => return Err(format!("unknown channel key {other}")),
    }
    Ok(())
}

fn empty_channels(count: usize) -> MotecChannels {
    MotecChannels {
        distance: vec![0.0; count],
        time: vec![0.0; count],
        speed: vec![0.0; count],
        throttle: vec![0.0; count],
        brake: vec![0.0; count],
        steer: vec![0.0; count],
        gear: vec![0.0; count],
        g_long: vec![0.0; count],
        g_lat: vec![0.0; count],
        x: vec![0.0; count],
        z: vec![0.0; count],
        pressure_fl: vec![0.0; count],
        pressure_fr: vec![0.0; count],
        pressure_rl: vec![0.0; count],
        pressure_rr: vec![0.0; count],
        brake_temp_fl: vec![0.0; count],
        brake_temp_fr: vec![0.0; count],
        rpm: vec![0.0; count],
        heading: vec![0.0; count],
    }
}

fn pad_or_trim(mut values: Vec<f32>, count: usize) -> Vec<f32> {
    if values.len() == count {
        return values;
    }
    if values.len() > count {
        values.truncate(count);
        return values;
    }
    values.resize(count, values.last().copied().unwrap_or(0.0));
    values
}

fn synthesize_time_ms(count: usize, rate_hz: u16) -> Vec<f32> {
    let rate = rate_hz.max(1) as f32;
    (0..count).map(|index| index as f32 * 1000.0 / rate).collect()
}

fn match_channel(name: &str) -> Option<&'static ChannelSpec> {
    let normalized = normalize_name(name);
    CHANNELS.iter().find(|spec| {
        normalize_name(spec.name) == normalized
            || normalize_name(spec.short_name) == normalized
            || aliases(spec.key)
                .iter()
                .any(|alias| normalize_name(alias) == normalized)
    })
}

fn aliases(key: &str) -> &'static [&'static str] {
    match key {
        "distance" => &["Lap Distance", "Corr Dist", "Distance", "LapDist"],
        "speed" => &["Ground Speed", "Speed", "GPS Speed", "Gnd Spd"],
        "throttle" => &["Throttle Pos", "Throttle", "Thr Pos", "Throttle Position"],
        "brake" => &["Brake Pos", "Brake", "Brk Pos", "Brake Position"],
        "steer" => &["Steering Angle", "Steer", "Steering", "Steer Angle"],
        "gear" => &["Gear", "Gear Pos"],
        "rpm" => &["Engine RPM", "RPM", "RPMS", "Engine Speed"],
        "gLat" => &["G Force Lat", "G Lat", "LatAcc", "GForceLat"],
        "gLong" => &["G Force Long", "G Long", "LongAcc", "GForceLong"],
        "x" => &["World Position X", "Pos X", "GPS Longitude", "Car Coord X"],
        "z" => &["World Position Z", "Pos Z", "GPS Latitude", "Car Coord Z"],
        "pressureFl" => &["Tyre Pressure FL", "Tire Pressure FL", "P FL"],
        "pressureFr" => &["Tyre Pressure FR", "Tire Pressure FR", "P FR"],
        "pressureRl" => &["Tyre Pressure RL", "Tire Pressure RL", "P RL"],
        "pressureRr" => &["Tyre Pressure RR", "Tire Pressure RR", "P RR"],
        "brakeTempFl" => &["Brake Temp FL", "Brake Disc Temp FL", "BT FL"],
        "brakeTempFr" => &["Brake Temp FR", "Brake Disc Temp FR", "BT FR"],
        "heading" => &["Heading", "Yaw", "Head"],
        _ => &[],
    }
}

fn normalize_name(name: &str) -> String {
    name.chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn date_time_strings(started_at: i64) -> (String, String) {
    let millis = started_at.max(0) as u64;
    let secs = millis / 1000;
    let days = secs / 86_400;
    let time_of_day = secs % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    (
        format!("{day:02}/{month:02}/{year}"),
        format!("{hours:02}:{minutes:02}:{seconds:02}"),
    )
}

fn parse_started_at(date: &str, time: &str) -> Option<i64> {
    let date = date.trim();
    let time = time.trim();
    let (day, month, year) = parse_date(date)?;
    let (hours, minutes, seconds) = parse_time(time)?;
    let days = days_from_civil(year, month, day)?;
    let secs = days * 86_400
        + hours as i64 * 3600
        + minutes as i64 * 60
        + seconds as i64;
    Some(secs * 1000)
}

fn parse_date(date: &str) -> Option<(u32, u32, i32)> {
    let parts: Vec<_> = date.split(['/', '-', '.']).collect();
    if parts.len() != 3 {
        return None;
    }
    let day: u32 = parts[0].parse().ok()?;
    let month: u32 = parts[1].parse().ok()?;
    let year: i32 = parts[2].parse().ok()?;
    if !(1..=31).contains(&day) || !(1..=12).contains(&month) || year < 1970 {
        return None;
    }
    Some((day, month, year))
}

fn parse_time(time: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<_> = time.split(':').collect();
    if parts.len() < 2 {
        return None;
    }
    let hours: u32 = parts[0].parse().ok()?;
    let minutes: u32 = parts[1].parse().ok()?;
    let seconds: u32 = parts.get(2).and_then(|part| part.parse().ok()).unwrap_or(0);
    if hours > 23 || minutes > 59 || seconds > 59 {
        return None;
    }
    Some((hours, minutes, seconds))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn days_from_civil(year: i32, month: u32, day: u32) -> Option<i64> {
    let month = month as i64;
    let day = day as i64;
    let year = year as i64 - if month <= 2 { 1 } else { 0 };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let m = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * m + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = (y + if month <= 2 { 1 } else { 0 }) as i32;
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_lap() -> MotecLap {
        MotecLap {
            meta: MotecMeta {
                driver: "Test".into(),
                vehicle: "bmw_m4_gt3".into(),
                venue: "monza".into(),
                session: "practice".into(),
                comment: "L1".into(),
                started_at: 1_704_067_200_000,
            },
            sample_rate_hz: 20,
            channels: MotecChannels {
                distance: vec![0.0, 10.0, 20.0, 30.0],
                time: vec![0.0, 50.0, 100.0, 150.0],
                speed: vec![80.0, 100.0, 120.0, 110.0],
                throttle: vec![0.2, 0.5, 1.0, 0.0],
                brake: vec![0.0, 0.0, 0.0, 0.8],
                steer: vec![0.0, -5.0, 2.0, 10.0],
                gear: vec![3.0, 4.0, 4.0, 3.0],
                g_long: vec![0.1, 0.2, -0.1, -0.5],
                g_lat: vec![0.0, 0.3, -0.2, 0.4],
                x: vec![1.0, 2.0, 3.0, 4.0],
                z: vec![5.0, 6.0, 7.0, 8.0],
                pressure_fl: vec![27.0; 4],
                pressure_fr: vec![27.1; 4],
                pressure_rl: vec![26.5; 4],
                pressure_rr: vec![26.6; 4],
                brake_temp_fl: vec![400.0; 4],
                brake_temp_fr: vec![410.0; 4],
                rpm: vec![5_000.0, 6_000.0, 7_000.0, 4_500.0],
                heading: vec![0.1, 0.2, 0.3, 0.4],
            },
        }
    }

    #[test]
    fn round_trip_preserves_channels() {
        let original = sample_lap();
        let bytes = encode_bytes(&original).expect("encode");
        let decoded = decode_bytes(&bytes).expect("decode");

        assert_eq!(decoded.meta.driver, "Test");
        assert_eq!(decoded.meta.vehicle, "bmw_m4_gt3");
        assert_eq!(decoded.meta.venue, "monza");
        assert_eq!(decoded.sample_rate_hz, 20);
        assert_eq!(decoded.channels.distance.len(), 4);

        for (left, right) in original
            .channels
            .speed
            .iter()
            .zip(decoded.channels.speed.iter())
        {
            assert!((left - right).abs() < 0.01, "{left} vs {right}");
        }
        for (left, right) in original
            .channels
            .throttle
            .iter()
            .zip(decoded.channels.throttle.iter())
        {
            assert!((left - right).abs() < 0.01, "{left} vs {right}");
        }
        assert!((decoded.channels.brake[3] - 0.8).abs() < 0.01);
    }

    #[test]
    fn estimate_rate_from_time_channel() {
        assert_eq!(estimate_rate_hz(&[0.0, 50.0, 100.0, 150.0]), 20);
    }

    #[test]
    fn date_round_trip() {
        let (date, time) = date_time_strings(1_704_067_200_000);
        assert_eq!(date, "01/01/2024");
        assert_eq!(time, "00:00:00");
        let parsed = parse_started_at(&date, &time).unwrap();
        assert_eq!(parsed, 1_704_067_200_000);
    }
}
