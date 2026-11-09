"""Villes proposées en saisie semi-automatique : les plus peuplées des pays de la plateforme, complétées par les villes déjà présentes chez les membres.
La liste est une aide à la saisie, jamais une contrainte : on peut toujours écrire une autre ville."""
import unicodedata

POPULAR_CITIES: dict[str, tuple[str, ...]] = {
    "BJ": ("Cotonou", "Abomey-Calavi", "Porto-Novo", "Parakou", "Djougou", "Bohicon", "Kandi", "Ouidah", "Abomey", "Natitingou", "Lokossa", "Savalou", "Sèmè-Kpodji", "Godomey", "Dassa-Zoumè", "Allada"),
    "CI": ("Abidjan", "Yamoussoukro", "Bouaké", "Daloa", "San-Pédro", "Korhogo", "Man", "Divo", "Gagnoa", "Abengourou", "Grand-Bassam", "Anyama", "Bingerville", "Séguéla", "Odienné", "Ferkessédougou"),
    "TG": ("Lomé", "Sokodé", "Kara", "Kpalimé", "Atakpamé", "Dapaong", "Tsévié", "Aného", "Bassar", "Sansanné-Mango", "Tchamba"),
    "SN": ("Dakar", "Touba", "Thiès", "Rufisque", "Kaolack", "Saint-Louis", "Mbour", "Ziguinchor", "Diourbel", "Louga", "Tambacounda", "Kolda", "Pikine", "Guédiawaye", "Saly"),
    "CM": ("Douala", "Yaoundé", "Garoua", "Bamenda", "Maroua", "Bafoussam", "Ngaoundéré", "Bertoua", "Kribi", "Limbé", "Buea", "Ebolowa", "Edéa", "Kumba"),
    "BF": ("Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Banfora", "Ouahigouya", "Pouytenga", "Dédougou", "Kaya", "Tenkodogo", "Fada N'Gourma", "Dori"),
    "ML": ("Bamako", "Sikasso", "Mopti", "Koutiala", "Kayes", "Ségou", "Gao", "Tombouctou", "Kati", "Kidal", "San", "Koulikoro"),
    "GA": ("Libreville", "Port-Gentil", "Franceville", "Oyem", "Moanda", "Lambaréné", "Mouila", "Tchibanga", "Makokou", "Koulamoutou", "Owendo"),
    "CD": ("Kinshasa", "Lubumbashi", "Mbuji-Mayi", "Kananga", "Kisangani", "Goma", "Bukavu", "Tshikapa", "Kolwezi", "Likasi", "Matadi", "Uvira", "Mbandaka", "Kikwit"),
    "FR": ("Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Montpellier", "Strasbourg", "Bordeaux", "Lille", "Rennes", "Reims", "Le Havre", "Saint-Étienne", "Toulon", "Grenoble", "Dijon", "Angers", "Nîmes", "Villeurbanne", "Montreuil", "Saint-Denis", "Créteil"),
    "BE": ("Bruxelles", "Anvers", "Gand", "Charleroi", "Liège", "Bruges", "Namur", "Louvain", "Mons", "Ixelles", "Schaerbeek"),
    "CA": ("Montréal", "Toronto", "Ottawa", "Québec", "Gatineau", "Laval", "Longueuil", "Sherbrooke", "Calgary", "Vancouver", "Edmonton", "Winnipeg", "Moncton", "Trois-Rivières"),
}

# Une ville issue des membres n'est proposée que si au moins ce nombre de personnes y vivent : on ne révèle pas la ville d'un membre isolé.
MIN_MEMBERS = 2
MAX_RESULTS = 8


def fold(s: str) -> str:
    """Minuscules sans accents ni tirets : « Lomé », « lome » et « LOMÉ » se valent ; « saint etienne » trouve « Saint-Étienne »."""
    s = unicodedata.normalize("NFD", s.strip().lower())
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn").replace("-", " ").replace("'", " ")


def suggest(country: str | None, q: str, member_cities: list[tuple[str, int]]) -> list[str]:
    """Fusionne villes populaires et villes des membres (dédoublonnées sans tenir compte des accents), puis filtre sur la saisie :
    d'abord celles qui COMMENCENT par la saisie, ensuite celles qui la contiennent."""
    if not country or country not in POPULAR_CITIES:
        return []
    ranked: dict[str, tuple[str, int]] = {}
    for i, name in enumerate(POPULAR_CITIES[country]):
        ranked[fold(name)] = (name, 10_000 - i)  # ordre de la liste = population décroissante
    for name, n in member_cities:
        key = fold(name)
        if key and key not in ranked and n >= MIN_MEMBERS:
            ranked[key] = (name.strip(), n)
    needle = fold(q)
    starts, contains = [], []
    for key, (name, score) in ranked.items():
        if not needle or key.startswith(needle):
            starts.append((score, name))
        elif needle in key:
            contains.append((score, name))
    return [n for _, n in sorted(starts, reverse=True) + sorted(contains, reverse=True)][:MAX_RESULTS]
