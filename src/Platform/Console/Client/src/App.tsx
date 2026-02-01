
import React, { useEffect, useState } from 'react';

// Types
interface KernelStatus {
    lifecycle: string;
    version: string;
    time: number;
}

interface StateSnapshot {
    metrics: Record<string, any>;
}

export default function App() {
    const [status, setStatus] = useState<KernelStatus | null>(null);
    const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<'DASHBOARD' | 'STUDIO' | 'RISK'>('DASHBOARD');
    const [draft, setDraft] = useState<string>(JSON.stringify({
        name: "My Protocol",
        version: "1.0.0",
        category: "Intent",
        lifecycle: "PROPOSED",
        strict: false,
        execution: [{ type: "MUTATE_METRIC", metricId: "load", mutation: 5 }],
        preconditions: []
    }, null, 2));
    const [simResult, setSimResult] = useState<any>(null);

    const fetchData = async () => {
        try {
            const statusRes = await fetch('/api/status');
            const statusData = await statusRes.json();
            setStatus(statusData);

            const stateRes = await fetch('/api/state/snapshot');
            const stateData = await stateRes.json();
            if (stateData.ok) {
                setSnapshot({ metrics: stateData.data });
            }
        } catch (e: any) {
            setError(e.message);
        }
    };

    const runSimulation = async () => {
        try {
            const p = JSON.parse(draft);
            const res = await fetch('/api/studio/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ protocol: p, horizon: 20 })
            });
            const data = await res.json();
            if (data.ok) setSimResult(data.forecast);
            else alert("Sim Failed: " + data.error);
        } catch (e: any) {
            alert("Invalid JSON: " + e.message);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
            <header style={{ marginBottom: '2rem', borderBottom: '1px solid #333', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>IRON Governance Console</h1>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
                        <span>Lifecycle: <strong style={{ color: status?.lifecycle === 'ACTIVE' ? '#4ade80' : '#f87171' }}>{status?.lifecycle || 'OFFLINE'}</strong></span>
                        <span>Version: {status?.version || '-'}</span>
                        <span>Time: {status ? new Date(status.time).toLocaleTimeString() : '-'}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setTab('DASHBOARD')} style={{ padding: '0.5rem 1rem', background: tab === 'DASHBOARD' ? '#2563eb' : '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Dashboard</button>
                    <button onClick={() => setTab('STUDIO')} style={{ padding: '0.5rem 1rem', background: tab === 'STUDIO' ? '#2563eb' : '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Studio</button>
                    <button onClick={() => setTab('RISK')} style={{ padding: '0.5rem 1rem', background: tab === 'RISK' ? '#e11d48' : '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Risk Engine</button>
                </div>
            </header>

            {error && (
                <div style={{ padding: '1rem', background: '#450a0a', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem' }}>
                    Error: {error}
                </div>
            )}

            {
                tab === 'DASHBOARD' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {/* Metric Card */}
                        <section style={{ background: '#1a1d24', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
                            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#a3a3a3' }}>Kernel State</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {snapshot && Object.keys(snapshot.metrics).length > 0 ? (
                                    Object.entries(snapshot.metrics).map(([key, val]) => (
                                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: '#22252b', borderRadius: '4px' }}>
                                            <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{key}</span>
                                            <span style={{ fontWeight: 600 }}>{JSON.stringify(val.value)}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ color: '#666', fontStyle: 'italic' }}>No metrics tracked.</div>
                                )}
                            </div>
                        </section>

                        {/* Authority Placeholder */}
                        <section style={{ background: '#1a1d24', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
                            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#a3a3a3' }}>Authority Status</h2>
                            <div style={{ color: '#888' }}>
                                Graph visualization coming in XIV.2.
                            </div>
                        </section>
                    </div>
                ) : tab === 'STUDIO' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <section>
                            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Protocol Editor (JSON DSL)</h2>
                            <textarea
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                style={{ width: '100%', height: '500px', background: '#1a1d24', color: '#e0e0e0', border: '1px solid #333', padding: '1rem', fontFamily: 'monospace' }}
                            />
                            <div style={{ marginTop: '1rem' }}>
                                <button onClick={runSimulation} style={{ padding: '0.75rem 1.5rem', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Validate & Simulate</button>
                            </div>
                        </section>
                    </div>
                ) : (
                    /* RISK ENGINE TAB */
                    <div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                            <section style={{ background: '#1a1d24', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
                                <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#a3a3a3' }}>Risk Heatmap</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                    <ComplianceWidget />
                                </div>
                            </section>
                        </div>
                    </div>
                )
            }
        </div>
    );
}

function ComplianceWidget() {
    const [scorecard, setScorecard] = useState<any[]>([]);

    useEffect(() => {
        fetch('/api/ire/compliance').then(r => r.json()).then(d => {
            if (d.ok) setScorecard(d.data);
        });
    }, []);

    if (scorecard.length === 0) return <div style={{ color: '#666' }}>Loading Risks...</div>;

    return (
        <>
            {scorecard.map(r => (
                <div key={r.riskId} style={{
                    padding: '1rem', borderRadius: '6px',
                    borderLeft: `4px solid ${r.mitigated ? '#4ade80' : '#f87171'}`,
                    background: '#22252b'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: '#333' }}>{r.severity}</span>
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: r.mitigated ? '#4ade80' : '#f87171' }}>
                        {r.mitigated ? 'MITIGATED' : 'UNMITIGATED'}
                    </div>
                </div>
            ))}
        </>
    );
}
