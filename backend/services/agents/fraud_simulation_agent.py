"""Backward-compatible fraud simulation alias."""

from services.agents.gan_agent import GANFraudAgent


class FraudSimulationAgent(GANFraudAgent):
    pass
