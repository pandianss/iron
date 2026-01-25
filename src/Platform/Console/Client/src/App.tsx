
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

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ marginBottom: '2rem', borderBottom: '1px solid #333', paddingBottom: '1rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>IRON Governance Console</h1>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
                    <span>Lifecycle: <strong style={{ color: status?.lifecycle === 'ACTIVE' ? '#4ade80' : '#f87171' }}>{status?.lifecycle || 'OFFLINE'}</strong></span>
                    <span>Version: {status?.version || '-'}</span>
                    <span>Time: {status ? new Date(status.time).toLocaleTimeString() : '-'}</span>
                </div>
            </header>

            {error && (
                <div style={{ padding: '1rem', background: '#450a0a', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem' }}>
                    Error: {error}
                </div>
            )}

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

                {/* Audit Placeholder */}
                <section style={{ background: '#1a1d24', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
                    <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#a3a3a3' }}>Recent Evidence</h2>
                    <div style={{ color: '#888' }}>
                        Audit log stream coming in XIV.3.
                    </div>
                </section>

            </div>
        </div>
    );
}
