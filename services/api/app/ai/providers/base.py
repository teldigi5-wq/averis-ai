from abc import ABC, abstractmethod


class AIProvider(ABC):
    @abstractmethod
    async def health(self) -> dict[str, object]:
        raise NotImplementedError
