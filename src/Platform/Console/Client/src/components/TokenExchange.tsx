import React, { useEffect, useState } from 'react';

export function TokenExchange() {
    const [rewards, setRewards] = useState<any[]>([]);
    const [balance, setBalance] = useState(0);

    const fetchData = () => {
        fetch('/api/operant/exchange')
            .then(r => r.json())
            .then(d => { if (d.ok) setRewards(d.data); });

        fetch('/api/operant/summary')
            .then(r => r.json())
            .then(d => { if (d.ok) setBalance(d.data.tokenBalance); });
    };

    useEffect(() => {
        fetchData();
    }, []);

    const redeem = async (id: string, cost: number) => {
        if (balance < cost) {
            alert("Insufficient Tokens");
            return;
        }

        // Placeholder for redemption action
        alert(`Redemption of ${id} initiated. Total tokens remaining: ${balance - cost}`);
        // In a real impl, this would submit an action to the kernel
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Token Exchange</h2>
                <div style={balanceBadgeStyle}>
                    <span style={{ fontSize: '1.25rem' }}>🪙</span>
                    <span style={{ fontWeight: 700 }}>{balance} TOKENS</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {rewards.map(reward => (
                    <div key={reward.id} style={rewardCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div style={iconBoxStyle}>{reward.id.includes('rew-01') ? '🧠' : reward.id.includes('rew-02') ? '⚡' : '🛡️'}</div>
                            <div style={costTagStyle}>{reward.cost} 🪙</div>
                        </div>
                        <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 600 }}>{reward.name}</h4>
                        <p style={{ fontSize: '0.875rem', color: '#9ca3af', minHeight: '3rem' }}>{reward.description}</p>
                        <button
                            onClick={() => redeem(reward.id, reward.cost)}
                            disabled={balance < reward.cost}
                            style={{
                                ...redeemButtonStyle,
                                opacity: balance < reward.cost ? 0.5 : 1,
                                cursor: balance < reward.cost ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {balance < reward.cost ? 'INSUFFICIENT FUNDS' : 'REDEEM'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

const balanceBadgeStyle: React.CSSProperties = {
    background: 'rgba(251, 191, 36, 0.15)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    color: '#fbbf24',
    padding: '0.5rem 1rem',
    borderRadius: 'full',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    boxShadow: '0 0 20px rgba(251, 191, 36, 0.1)'
};

const rewardCardStyle: React.CSSProperties = {
    background: 'rgba(26, 29, 36, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    padding: '1.5rem',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
};

const iconBoxStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    background: 'rgba(129, 140, 248, 0.1)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem'
};

const costTagStyle: React.CSSProperties = {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#fbbf24',
    background: 'rgba(251, 191, 36, 0.1)',
    padding: '0.25rem 0.75rem',
    borderRadius: '6px'
};

const redeemButtonStyle: React.CSSProperties = {
    width: '100%',
    marginTop: '1.5rem',
    padding: '0.75rem',
    background: 'rgba(129, 140, 248, 0.1)',
    border: '1px solid rgba(129, 140, 248, 0.3)',
    color: '#a5b4fc',
    borderRadius: '8px',
    fontWeight: 600,
    letterSpacing: '0.025em',
    transition: 'all 0.2s ease'
};
