import { DeterministicTime } from '../../L0/Kernel.js';
import { IdentityManager } from '../../L1/Identity.js';
import type { Principal } from '../../L1/Identity.js';
import { MetricRegistry, MetricType, StateModel } from '../../L2/State.js';
import { GovernanceInterface, AttestationAPI, FederationBridge } from '../../L6/Interface.js';
import { AuditLog } from '../../L5/Audit.js';

import { generateKeyPair } from '../../L0/Crypto.js';
import { CapabilitySet } from '../../L1/Identity.js';

describe('L6 Interfaces & Federation', () => {
    let audit: AuditLog;
    let time: DeterministicTime;
    let registry: MetricRegistry;
    let identity: IdentityManager;
    let state: StateModel;
    let govInterface: GovernanceInterface;
    let attestationApi: AttestationAPI;
    let bridge: FederationBridge;
    const adminKeys = generateKeyPair();
    const admin: Principal = {
        id: 'admin',
        publicKey: adminKeys.publicKey,
        type: 'INDIVIDUAL',
        alive: true,
        revoked: false,
        scopeOf: new CapabilitySet(['*']),
        parents: [],
        createdAt: '0:0'
    };

    beforeEach(() => {
        audit = new AuditLog();
        time = new DeterministicTime();
        registry = new MetricRegistry();
        identity = new IdentityManager();
        identity.register(admin);
        state = new StateModel(audit, registry, identity);

        registry.register({ id: 'score', description: 'Score', type: MetricType.GAUGE });
        govInterface = new GovernanceInterface(state, audit);
        attestationApi = new AttestationAPI(audit, adminKeys, 'KERNEL_PROD');
        bridge = new FederationBridge(state);
    });

    test('Governance Interface: Should retrieve audit trail', () => {
        state.applyTrusted({ metricId: 'score', value: 10 }, time.getNow().toString(), admin.id);
        state.applyTrusted({ metricId: 'score', value: 20 }, time.getNow().toString(), admin.id);

        const trail = govInterface.getAuditTrail('score');
        expect(trail.length).toBe(2);
        expect(trail[0]!.value).toBe(10);
        expect(trail[1]!.value).toBe(20);
        expect(trail[0]!.proof).toBeDefined();
    });

    test('Attestation API: Should generate proof', () => {
        const intent = state.applyTrusted({ metricId: 'score', value: 100 }, time.getNow().toString(), admin.id);

        const packet = attestationApi.generateAttestation(intent);
        expect(packet.payload.value).toBe(100);
        expect(packet.payload.ledgerHash).toBeDefined();
        expect(packet.payload.ledgerHash).not.toBe('unknown');
    });

    test('Federation: Should reject untrusted partners', () => {
        const packet = attestationApi.generateAttestation({
            intentId: 'id',
            principalId: 'admin',
            payload: { metricId: 'score', value: 50 },
            timestamp: '0:0',
            expiresAt: '0',
            signature: 'sig'
        });
        const accepted = bridge.ingestAttestation(packet);
        expect(accepted).toBe(false);
    });

    test('Federation: Should accept trusted partners', () => {
        bridge.registerPartner('KERNEL_PROD', adminKeys.publicKey);
        const intent = state.applyTrusted({ metricId: 'score', value: 50 }, time.getNow().toString(), admin.id);
        const packet = attestationApi.generateAttestation(intent);

        const accepted = bridge.ingestAttestation(packet);
        expect(accepted).toBe(true);
        expect(state.get('score')).toBe(50);
    });
});
