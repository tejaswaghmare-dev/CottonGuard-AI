import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function HistoryChart({ predictions }) {
  const data = [...(predictions || [])]
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    .map((p) => ({
      date: (p.createdAt || '').slice(0, 10),
      leafSeverity: p.leafSeverity ?? 0,
      disease: p.disease,
    }));

  if (data.length === 0) {
    return <p className="muted">No history yet for this farm.</p>;
  }

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d5e3d8" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value, _n, props) => [`${value}% leaf severity`, props.payload.disease]}
          />
          <Line type="monotone" dataKey="leafSeverity" stroke="#2f7d4a" strokeWidth={3} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
        Chart shows observed model leaf-severity outputs over time — not proof that the entire farm is improving or worsening.
      </p>
    </div>
  );
}
