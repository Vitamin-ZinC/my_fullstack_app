"use client";

import type { AudioSignalAnalysis } from "@levelup/contracts";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useUiLocale } from "@/lib/locale";
import { audioSignalText } from "@/lib/audioSignalText";
import styles from "./AudioSignalPanel.module.css";

export function AudioSignalPanel({ value }: { value: AudioSignalAnalysis }) {
  const locale = useUiLocale();
  const text = audioSignalText[locale];
  const format = (value: number | null, unit = "") => value === null ? text.unavailable
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}${unit ? ` ${unit}` : ""}`;
  const chart = (key: "pitchMedianHz" | "loudnessMedianDbfs", title: string, color: string, unit: string) => (
    <figure className={styles.chart} aria-label={title}>
      <figcaption>{title} · {unit}</figcaption>
      <ResponsiveContainer width="100%" height={180} minWidth={0}>
        <LineChart data={value.timeline} margin={{ top: 10, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#263b4b" strokeDasharray="3 3" />
          <XAxis dataKey="startSeconds" tick={{ fill: "#b9cbd6", fontSize: 11 }} tickFormatter={value => `${value} ${text.seconds}`} minTickGap={25} />
          <YAxis domain={["auto", "auto"]} width={42} tick={{ fill: "#b9cbd6", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#0b1923", borderColor: "#385164", color: "#e4eff5" }}
            labelFormatter={value => `${value} ${text.seconds}`} formatter={value => [format(typeof value === "number" ? value : null, unit), title]} />
          <Line type="linear" dataKey={key} name={title} stroke={color} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
  return (
    <div className={styles.panel} data-testid="audio-signal-panel">
      <h3>{text.title}</h3>
      <p className={styles.note}>{text.note}</p>
      <dl className={styles.summary}>
        <div><dt>{text.pitch}</dt><dd>{format(value.pitch.medianHz, text.hz)}</dd><small>{text[value.pitch.status]}</small></div>
        <div><dt>{text.range}</dt><dd>{format(value.pitch.rangeSemitones, text.semitones)}</dd></div>
        <div><dt>{text.pauses}</dt><dd>{value.pauses.status === "unavailable" ? text.unavailable : value.pauses.count}</dd><small>{text[value.pauses.status]}</small></div>
        <div><dt>{text.medianPause}</dt><dd>{format(value.pauses.medianMs, text.ms)}</dd></div>
        <div><dt>{text.loudness}</dt><dd>{format(value.loudness.medianDbfs, "dBFS")}</dd><small>{text[value.loudness.status]}</small></div>
        <div><dt>{text.speech}</dt><dd>{format(value.speechSeconds, text.seconds)}</dd></div>
      </dl>
      <p className={styles.note}>{text.coverage}: {Math.round(value.pitch.speechCoverage * 100)}%. {text.pauseNote}</p>
      {value.warnings.length > 0 && <ul className={styles.warnings}>{value.warnings.map(warning => <li key={warning}>{text[warning]}</li>)}</ul>}
      <h4>{text.timeline}</h4>
      <div className={styles.charts}>
        {chart("pitchMedianHz", text.pitch, "#28d6e5", text.hz)}
        {chart("loudnessMedianDbfs", text.loudness, "#e2b951", "dBFS")}
      </div>
      <details>
        <summary>{text.table}</summary>
        <div className={styles.table} tabIndex={0} role="region" aria-label={text.table}>
          <table>
            <thead><tr><th>{text.interval}</th><th>F0 · {text.hz}</th><th>dBFS</th><th>{text.pauses}</th></tr></thead>
            <tbody>{value.timeline.map(window => <tr key={window.startSeconds}>
              <td>{window.startSeconds}–{window.endSeconds} {text.seconds}<small>{text[window.status]}</small></td>
              <td>{format(window.pitchMedianHz)}</td><td>{format(window.loudnessMedianDbfs)}</td><td>{window.pauseCount}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
