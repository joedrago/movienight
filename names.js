const NAMES = [
    "Banjo",
    "Bayonetta",
    "Bowser Jr.",
    "Bowser",
    "Byleth",
    "Captain Falcon",
    "Charizard",
    "Chrom",
    "Cloud",
    "Corrin",
    "Daisy",
    "Dark Pit",
    "Dark Samus",
    "Diddy Kong",
    "Donkey Kong",
    "Dr. Mario",
    "Duck Hunt",
    "Falco",
    "Fox",
    "Ganondorf",
    "Greninja",
    "Hero",
    "Ice Climbers",
    "Ike",
    "Incineroar",
    "Inkling",
    "Isabelle",
    "Ivysaur",
    "Jigglypuff",
    "Joker",
    "Kazooie",
    "Kazuya",
    "Ken",
    "King Dedede",
    "King K. Rool",
    "Kirby",
    "Link",
    "Little Mac",
    "Lucario",
    "Lucas",
    "Lucina",
    "Luigi",
    "Mario",
    "Marth",
    "Mega Man",
    "Meta Knight",
    "Mewtwo",
    "Mii Brawler",
    "Mii Gunner",
    "Mii Swordfighter",
    "Min Min",
    "Mr. Game & Watch",
    "Mythra",
    "Ness",
    "Olimar",
    "Pac-Man",
    "Palutena",
    "Peach",
    "Pichu",
    "Pikachu",
    "Piranha Plant",
    "Pit",
    "Pyra",
    "R.O.B.",
    "Richter",
    "Ridley",
    "Robin",
    "Rosalina",
    "Roy",
    "Ryu",
    "Samus",
    "Sephiroth",
    "Sheik",
    "Shulk",
    "Simon",
    "Snake",
    "Sonic",
    "Sora",
    "Squirtle",
    "Steve",
    "Terry",
    "Toon Link",
    "Villager",
    "Wario",
    "Wii Fit Trainer",
    "Wolf",
    "Yoshi",
    "Young Link",
    "Zelda",
    "Zero Suit Samus"
]

const clone = (o) => {
    return JSON.parse(JSON.stringify(o))
}

const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; --i) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = array[i]
        array[i] = array[j]
        array[j] = temp
    }
}

let namePool = []
function randomName() {
    if (namePool.length < 1) {
        namePool = clone(NAMES)
        shuffle(namePool)
    }
    return namePool.shift()
}

module.exports = { randomName }
