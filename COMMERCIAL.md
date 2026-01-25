# IRON Commercial Architecture

> [!IMPORTANT]
> This document defines the **Business Physics** of the IRON Venture.
> It separates the "Public Commons" from the "Monetizable Asset".

## 1. The Stack Mapping

| Layer | Technical Component | Commercial Status | Licensing |
| :--- | :--- | :--- | :--- |
| **L7** | **App** | Reference Implementation | MIT (Open) |
| **L6** | **Interface** | API Gateway | MIT (Open) |
| **L5** | **Audit** | **The Trust Anchor** | **Commercial (Enterprise)** |
| **L4** | **Protocol** | **The Market** | **Revenue Share / Marketplace** |
| **L3** | **Simulation** | **Safety Engine** | **Commercial (Enterprise)** |
| **L2** | **State** | Constitutional Objects | MIT (Open) |
| **L1** | **Authority** | **Identity Engine** | **Commercial (Core)** |
| **L0** | **Kernel** | **The IP** | **BSL (Business Source License)** |

## 2. The Protocol Economy (L4)

Protocols are the "Apps" of the Governance Operating System. They are tradable, versioned assets.

### 2.1 The Standard (`IronProtocol v1.0`)
Every commercial protocol must define:
1.  **SemVer**: `Major.Minor.Patch` compatibility enforcement.
2.  **Economic Model**:
    *   `Gas`: Computational cost to execute (Denial of Service protection).
    *   `Price`: Licensing fee (per-call or subscription).
3.  **Safety Grade**:
    *   `Unverified`: Use at own risk.
    *   `Audited`: Statically analyzed by IRON tools.
    *   `Certified`: Formally verified by IRON engineers.

## 3. The Enterprise Moat (L0, L1, L3, L5)

Our defensibility comes from the **Integrity Loop**:
1.  **Kernel (L0)** enforces the Constitution.
2.  **Simulation (L3)** predicts the future (Risk).
3.  **Audit (L5)** proves the past (Compliance).

*We give away the Interface (L6/L7). We sell the Safety (L0/L3/L5).*
