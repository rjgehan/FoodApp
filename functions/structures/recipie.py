from dataclasses import dataclass
from typing import Any


@dataclass
class Recipe:
    name: str

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Recipe":
        return cls(name=str(data.get("name", "")))

    @classmethod
    def from_list(cls, data: list[Any]) -> "Recipe":
        return cls(name=str(data[0]) if len(data) > 0 else "")
