import React, { useEffect, useState } from 'react';

export function OperantDashboard() {
    const [summary, setSummary] = useState<any>(null);

    useEffect(() => {
        fetch('/api/operant/summary')
            .then(r => r.json())
            .then(d => {
                if (d.ok) setSummary(d.data);
            });
    }, []);

    if (!summary) return <div style={{ color: '#888' }}>Initializing Focus Matrix...</div>;

    const focusColor = summary.focus > 70 ? '#4ade80' : summary.focus > 40 ? '#fbbf24' : '#f87171';

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {/* Focus Ring Indicator */}
            <div style={cardStyle}>
                <h3 style={headerStyle}>Focus Level</h3>
                <div style={{ position: 'relative', width: '200px', height: '200px', margin: '1rem auto' }}>
                    <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#2d3748" strokeWidth="8" />
                        <circle cx="50" cy="50" r="45" fill="none" stroke={focusColor} strokeWidth="8"
                            strokeDasharray="283" strokeDashoffset={283 - (283 * summary.focus) / 100}
                            style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
                    </svg>
                    <div style={centerTextStyle}>
                        <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{summary.focus}%</div>
                        <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase' }}>Optimal</div>
                    </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#888', marginTop: '1rem' }}>
                    FOCUS LEVEL: {summary.focus}/100 - {summary.focus > 70 ? 'PEAK' : 'STABILIZING'}
                </div>
            </div>

            {/* Training Volume Graph Placeholder */}
            <div style={cardStyle}>
                <h3 style={headerStyle}>Training Volume</h3>
                <div style={{ height: '150px', background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.1) 0%, rgba(96, 165, 250, 0) 100%)', borderRadius: '8px', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', padding: '1rem' }}>
                    {[40, 60, 45, 70, 85, 92, 80].map((h, i) => (
                        <div key={i} style={{ flex: 1, background: '#60a5fa', height: `${h}%`, margin: '0 2px', borderRadius: '2px 2px 0 0', opacity: 0.7 }} />
                    ))}
                    <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontSize: '1.5rem', fontWeight: 600 }}>{summary.trainingVolume}</div>
                </div>
                <div style={{ marginTop: '1rem', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between', color: '#888' }}>
                    <span>Weekly Progression</span>
                    <span style={{ color: '#4ade80' }}>+12%</span>
                </div>
            </div>

            {/* Quick Metrics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <MetricModule label="Token Balance" value={`${summary.tokenBalance} TOKENS`} icon="🪙" color="#fbbf24" />
                <MetricModule label="Recovery State" value="92% RESTED" icon="🫀" color="#f87171" />
                <MetricModule label="Cognitive Load" value={`MEDIUM - ${summary.cognitiveLoad}%`} icon="🧠" color="#818cf8" />
            </div>
        </div>
    );
}

function MetricModule({ label, value, icon, color }: any) {
    return (
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1rem 1.5rem' }}>
            <div style={{ fontSize: '2rem' }}>{icon}</div>
            <div>
                <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color }}>{value}</div>
            </div>
        </div>
    );
}

const cardStyle: React.CSSProperties = {
    background: 'rgba(26, 29, 36, 0.6)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
};

const headerStyle: React.CSSProperties = {
    fontSize: '0.875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#a3a3a3',
    marginBottom: '1rem',
    fontWeight: 500
};

const centerTextStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center'
};
