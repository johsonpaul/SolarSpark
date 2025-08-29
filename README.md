# 🌞 SolarSpark: Token Incentives for Off-Grid Solar Adoption

Welcome to SolarSpark, a Web3 project revolutionizing energy access in rural areas! By leveraging the Stacks blockchain and Clarity smart contracts, we incentivize off-grid solar panel users to share their usage data through token rewards. This data contributes to global energy studies, helping researchers and policymakers improve sustainable energy solutions worldwide.

## ✨ Features

🔋 Register solar installations and earn setup bonuses  
📊 Submit verified usage data (e.g., energy generation, consumption) for token rewards  
💰 Reward pool funded by donors, NGOs, and carbon credit integrations  
🔍 Researchers access anonymized datasets for studies  
🏆 Staking mechanism to boost rewards for consistent participants  
📈 Governance for community-driven improvements  
🚫 Fraud prevention through data validation oracles  
🌍 Real-world impact: Accelerates solar adoption in underserved regions by providing economic incentives

## 🛠 How It Works

SolarSpark uses 8 Clarity smart contracts to create a secure, decentralized ecosystem. Here's a high-level overview:

1. **SolarToken (FT Contract)**: A fungible token (SIP-010 compliant) used for rewards. Handles minting, burning, and transfers.
2. **UserRegistry**: Registers users and their solar installations with unique IDs, verifying eligibility (e.g., rural location via oracle).
3. **DataSubmission**: Allows users to submit hashed usage data (e.g., daily kWh generated) with timestamps.
4. **DataVerifier**: Integrates with oracles to validate submitted data against real-world sensors or APIs, preventing fraud.
5. **RewardDistributor**: Calculates and distributes tokens based on data quality, frequency, and impact metrics.
6. **StakePool**: Users stake tokens to earn boosted rewards; includes slashing for invalid data.
7. **DataAggregator**: Anonymizes and aggregates data for researcher access, ensuring privacy.
8. **GovernanceDAO**: Token holders vote on parameters like reward rates or partnerships using a DAO model.

**For Rural Solar Users**  
- Install solar panels and register via UserRegistry with proof (e.g., device ID).  
- Connect IoT sensors to submit data automatically to DataSubmission.  
- Call submit-data with your usage metrics (e.g., energy produced, battery levels).  
- Verified data triggers rewards from RewardDistributor—earn SolarTokens for consistent sharing!  
- Stake tokens in StakePool for higher yields.  

Boom! You're earning while contributing to global energy research.

**For Researchers and NGOs**  
- Fund the reward pool by transferring tokens to RewardDistributor.  
- Query anonymized data from DataAggregator for studies on energy patterns.  
- Propose improvements via GovernanceDAO votes.  

**For Validators/Oracles**  
- Use DataVerifier to confirm data authenticity (e.g., cross-check with weather APIs).  

That's it! A transparent, incentivized system driving solar adoption and data-driven insights.

## 📚 Smart Contract Details

All contracts are written in Clarity for the Stacks blockchain, ensuring security and Bitcoin-anchored finality.

- **SolarToken.clar**: Defines the fungible token with minting restricted to RewardDistributor.  
- **UserRegistry.clar**: Maps principals to installation details; prevents duplicates.  
- **DataSubmission.clar**: Stores hashed data entries with emission events.  
- **DataVerifier.clar**: Uses post-conditions and oracles for validation.  
- **RewardDistributor.clar**: Algorithmically computes rewards (e.g., based on data volume and rarity).  
- **StakePool.clar**: Handles staking, unstaking, and reward multipliers.  
- **DataAggregator.clar**: Provides read-only views of aggregated stats.  
- **GovernanceDAO.clar**: Implements proposal submission and voting with token weights.

Deploy on Stacks testnet for testing, then mainnet for real impact!

## 🚀 Getting Started

1. Install Clarinet for local development.  
2. Clone the repo and deploy contracts.  
3. Integrate with a frontend dApp for user-friendly interactions.  

Join the movement—power the future with SolarSpark! 🌍⚡