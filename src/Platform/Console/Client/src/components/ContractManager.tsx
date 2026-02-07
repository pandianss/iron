import React, { useEffect, useState } from 'react';

export function ContractManager() {
    const [contracts, setContracts] = useState<any[]>([]);

    useEffect(() => {
        fetch('/api/operant/contracts')
            .then(r => r.json())
            .then(d => { if (d.ok) setContracts(d.data); });
    }, []);

    return (
        <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '2rem' }}>Core Contracts</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {contracts.length === 0 ? (
                    <div style={{ color: '#666', fontStyle: 'italic' }}>No active behavioral contracts found.</div>
                ) : (
                    contracts.map(contract => (
                        <div key={contract.id} style={contractCardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h4 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{contract.name}</h4>
                                    <div style={{ fontSize: '0.875rem', color: '#888', marginTop: '0.25rem' }}>
                                        {contract.category} Management • {contract.version}
                                    </div>
                                </div>
                                <div style={statusBadgeStyle(contract.lifecycle)}>
                                    {contract.lifecycle}
                                </div>
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 200px', gap: '2rem', alignItems: 'center' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                                        <span>Progression Matrix</span>
                                        <span>75%</span>
                                    </div>
                                    <div style={progressBgStyle}>
                                        <div style={{ ...progressFillStyle, width: '75%', background: '#60a5fa' }} />
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Fracture Risk</div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                        <div style={riskGaugeStyle(15)} />
                                        <span style={{ fontWeight: 600, color: '#4ade80' }}>LOW (15%)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

const contractCardStyle: React.CSSProperties = {
    background: 'rgba(26, 29, 36, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    padding: '1.5rem',
    position: 'relative',
    overflow: 'hidden'
};

const statusBadgeStyle = (status: string): React.CSSProperties => ({
    padding: '0.25rem 0.75rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: status === 'ACTIVE' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)',
    color: status === 'ACTIVE' ? '#4ade80' : '#fbbf24',
    border: `1px solid ${status === 'ACTIVE' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 191, 36, 0.2)'}`
});

const progressBgStyle: React.CSSProperties = {
    height: '6px',
    background: '#27272a',
    borderRadius: '3px',
    width: '100%'
};

const progressFillStyle: React.CSSProperties = {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.5s ease'
};

const riskGaugeStyle = (risk: number): React.CSSProperties => ({
    width: '40px',
    height: '4px',
    background: '#27272a',
    borderRadius: '2px',
    position: 'relative',
    overflow: 'hidden',
    display: 'inline-block'
});
