"""La versione dei workflow riutilizzabili e quella di modello/ devono coincidere."""
import re
import unittest
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
FLUSSI = ("sync.yml", "piano.yml")


def ref_predefinito(testo):
    m = re.search(r"\n      ref:\n(?:        .*\n)*?        default: (\S+)\n", testo)
    return m and m.group(1)


class VersioniTest(unittest.TestCase):
    def test_stessa_versione_ovunque(self):
        versioni = set()
        for nome in FLUSSI:
            ref = ref_predefinito((RADICE / ".github/workflows" / nome).read_text(encoding="utf-8"))
            self.assertRegex(ref or "", r"^v\d+$", f"ref predefinito di {nome}")
            versioni.add(ref)
            usa = re.findall(r"uses: ama-eddy/my-strava/\.github/workflows/" + re.escape(nome) + r"@(\S+)",
                             (RADICE / "modello/.github/workflows" / nome).read_text(encoding="utf-8"))
            self.assertEqual(len(usa), 1, f"modello/{nome}")
            versioni.add(usa[0])
        self.assertEqual(len(versioni), 1, f"versioni diverse: {sorted(versioni)}")


if __name__ == "__main__":
    unittest.main()
