
import * as ed from '@noble/ed25519';
import type { Entity } from '../../L1/Identity.js';

// Static random keys for the simulation (normally these would be securely managed)
// We generate them deterministically for reproducibility if possible, 
// but for this MVP random per run is fine or hardcoded hex for stability.
// Let's use hardcoded hex to ensure valid 32-byte keys for testing stability.

const makeKey = (seedChar: string) => {
    // 32-byte hex string? No, private key is 32 bytes.
    // We'll just generate random ones at runtime.
    const priv = ed.utils.randomPrivateKey();
    const pub = ed.getPublicKey(priv);
    return {
        priv,
        pub: Buffer.from(pub).toString('hex')
    };
};

export const IronCorpIdentities = {
    CEO: makeKey('1'),
    CFO: makeKey('2'),
    CTO: makeKey('3'),
    Server01: makeKey('4')
};

export const IronCorpOrgChar: Entity[] = [
    {
        id: 'iron.ceo',
        type: 'ACTOR',
        publicKey: IronCorpIdentities.CEO.pub,
        status: 'ACTIVE',
        createdAt: '0:0',
        identityProof: 'genesis_grant',
        isRoot: true // The Crown
    },
    {
        id: 'iron.cfo',
        type: 'ACTOR',
        publicKey: IronCorpIdentities.CFO.pub,
        status: 'ACTIVE',
        createdAt: '0:0',
        identityProof: 'ceo_appointment'
    },
    {
        id: 'iron.cto',
        type: 'ACTOR',
        publicKey: IronCorpIdentities.CTO.pub,
        status: 'ACTIVE',
        createdAt: '0:0',
        identityProof: 'ceo_appointment'
    },
    {
        id: 'iron.server.01',
        type: 'SYSTEM',
        publicKey: IronCorpIdentities.Server01.pub,
        status: 'ACTIVE',
        createdAt: '0:0',
        identityProof: 'cto_provision'
    }
];
