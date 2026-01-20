import { GovernanceKernel } from '../Kernel.js';
import { IdentityManager, DelegationEngine, CapabilitySet } from '../L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../L2/State.js';
import { ProtocolEngine } from '../L4/Protocol.js';
import { AuditLog } from '../L5/Audit.js';
import { IntentFactory } from '../L2/IntentFactory.js';
import { generateKeyPair } from '../L0/Crypto.js';
import { AttestationAPI, FederationBridge } from '../L6/Interface.js';

describe('IRON Federation Bridge', () => {
    // KERNEL A (Source of Truth)
    let kernelA: GovernanceKernel;
    let stateA: StateModel;
    let attestationA: AttestationAPI;
    const keysA = generateKeyPair();

    // KERNEL B (Target/Shadow)
    let kernelB: GovernanceKernel;
    let stateB: StateModel;
    let auditB: AuditLog;
    let bridgeB: FederationBridge;
    const keysB = generateKeyPair();

    beforeEach(() => {
        // ... (setup A remains same)
        const identityA = new IdentityManager();
        const registryA = new MetricRegistry();
        const auditA = new AuditLog();
        identityA.register({ id: 'rootA', publicKey: keysA.publicKey, type: 'INDIVIDUAL', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: '0:0', isRoot: true });
        stateA = new StateModel(auditA, registryA, identityA);
        registryA.register({ id: 'reputation', description: '', type: MetricType.GAUGE });
        kernelA = new GovernanceKernel(identityA, new DelegationEngine(identityA), stateA, new ProtocolEngine(stateA), auditA, registryA);
        attestationA = new AttestationAPI(auditA, keysA, 'KERNEL_A');

        // SETUP KERNEL B
        const identityB = new IdentityManager();
        const registryB = new MetricRegistry();
        auditB = new AuditLog();
        identityB.register({ id: 'rootB', publicKey: keysB.publicKey, type: 'INDIVIDUAL', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: '0:0', isRoot: true });
        stateB = new StateModel(auditB, registryB, identityB);
        registryB.register({ id: 'reputation', description: '', type: MetricType.GAUGE });
        kernelB = new GovernanceKernel(identityB, new DelegationEngine(identityB), stateB, new ProtocolEngine(stateB), auditB, registryB);
        bridgeB = new FederationBridge(stateB);
    });

    test('Cross-Kernel Attestation Flow', () => {
        // 1. Action on Kernel A
        const intent = IntentFactory.create('reputation', 95, 'rootA', keysA.privateKey, '0:10');
        kernelA.execute(intent);
        expect(stateA.get('reputation')).toBe(95);

        // 2. Generate Proof from Kernel A
        const proof = attestationA.generateAttestation(intent);

        // 3. Register Kernel A as a trusted partner in Kernel B
        bridgeB.registerPartner('KERNEL_A', keysA.publicKey);

        // 4. Ingest Proof into Kernel B
        const success = bridgeB.ingestAttestation(proof);
        expect(success).toBe(true);

        // 5. Verify Kernel B has synced the value
        expect(stateB.get('reputation')).toBe(95);

        // 6. Verify Audit Log entry in Kernel B shows the Shadow Identity
        const bHistory = auditB.getHistory();
        const lastEntry = bHistory[bHistory.length - 1]!;
        expect(lastEntry.intent.principalId).toBe('KERNEL_A:rootA');
    });

    test('Reject Unregistered Partner', () => {
        const intent = IntentFactory.create('reputation', 95, 'rootA', keysA.privateKey, '0:10');
        kernelA.execute(intent);
        const proof = attestationA.generateAttestation(intent);

        // Kernel B does NOT trust Kernel A yet
        const success = bridgeB.ingestAttestation(proof);
        expect(success).toBe(false);
        expect(stateB.get('reputation')).toBe(undefined);
    });

    test('Reject Tampered Attestation', () => {
        const intent = IntentFactory.create('reputation', 95, 'rootA', keysA.privateKey, '0:10');
        kernelA.execute(intent);
        const proof = attestationA.generateAttestation(intent);

        bridgeB.registerPartner('KERNEL_A', keysA.publicKey);

        // Tamper with the proof value
        proof.payload.value = 1000; // Fake reputation!

        const success = bridgeB.ingestAttestation(proof);
        expect(success).toBe(false);
        expect(stateB.get('reputation')).toBe(undefined);
    });
});
