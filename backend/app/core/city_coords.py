"""Position approximative (0,1° ≈ 11 km) des villes proposées à l'inscription : sert à estimer la distance entre deux membres qui n'ont pas partagé leur position.
La position partagée par le membre (Paramètres › Confidentialité) reste prioritaire. Une ville absente de cette table n'a pas de distance."""
from app.core.cities import fold

_C: dict[str, dict[str, tuple[float, float]]] = {
    "BJ": {"Cotonou": (6.4, 2.4), "Abomey-Calavi": (6.4, 2.3), "Porto-Novo": (6.5, 2.6), "Parakou": (9.3, 2.6), "Djougou": (9.7, 1.7), "Bohicon": (7.2, 2.1), "Kandi": (11.1, 2.9), "Ouidah": (6.4, 2.1),
           "Abomey": (7.2, 2.0), "Natitingou": (10.3, 1.4), "Lokossa": (6.6, 1.7), "Savalou": (7.9, 2.1), "Sèmè-Kpodji": (6.4, 2.6), "Godomey": (6.4, 2.3), "Dassa-Zoumè": (7.8, 2.2), "Allada": (6.7, 2.2)},
    "CI": {"Abidjan": (5.3, -4.0), "Yamoussoukro": (6.8, -5.3), "Bouaké": (7.7, -5.0), "Daloa": (6.9, -6.5), "San-Pédro": (4.7, -6.6), "Korhogo": (9.5, -5.6), "Man": (7.4, -7.6), "Divo": (5.8, -5.4),
           "Gagnoa": (6.1, -6.0), "Abengourou": (6.7, -3.5), "Grand-Bassam": (5.2, -3.7), "Anyama": (5.5, -4.1), "Bingerville": (5.4, -3.9), "Séguéla": (7.9, -6.7), "Odienné": (9.5, -7.6), "Ferkessédougou": (9.6, -5.2)},
    "TG": {"Lomé": (6.1, 1.2), "Sokodé": (8.98, 1.1), "Kara": (9.6, 1.2), "Kpalimé": (6.9, 0.6), "Atakpamé": (7.5, 1.1), "Dapaong": (10.9, 0.2), "Tsévié": (6.4, 1.2), "Aného": (6.2, 1.6),
           "Bassar": (9.3, 0.8), "Sansanné-Mango": (10.4, 0.5), "Tchamba": (9.0, 1.4)},
    "SN": {"Dakar": (14.7, -17.4), "Touba": (14.9, -15.9), "Thiès": (14.8, -16.9), "Rufisque": (14.7, -17.3), "Kaolack": (14.2, -16.1), "Saint-Louis": (16.0, -16.5), "Mbour": (14.4, -17.0), "Ziguinchor": (12.6, -16.3),
           "Diourbel": (14.7, -16.2), "Louga": (15.6, -16.2), "Tambacounda": (13.8, -13.7), "Kolda": (12.9, -14.9), "Pikine": (14.8, -17.4), "Guédiawaye": (14.8, -17.4), "Saly": (14.4, -17.0)},
    "NE": {"Niamey": (13.5, 2.1), "Zinder": (13.8, 8.99), "Maradi": (13.5, 7.1), "Agadez": (16.97, 7.99), "Tahoua": (14.9, 5.3), "Dosso": (13.05, 3.2), "Tillabéri": (14.2, 1.45), "Arlit": (18.7, 7.4), "Diffa": (13.3, 12.6), "Birni N'Konni": (13.8, 5.25)},
    "CM": {"Douala": (4.1, 9.7), "Yaoundé": (3.9, 11.5), "Garoua": (9.3, 13.4), "Bamenda": (5.9, 10.2), "Maroua": (10.6, 14.3), "Bafoussam": (5.5, 10.4), "Ngaoundéré": (7.3, 13.6), "Bertoua": (4.6, 13.7),
           "Kribi": (2.9, 9.9), "Limbé": (4.0, 9.2), "Buea": (4.2, 9.2), "Ebolowa": (2.9, 11.2), "Edéa": (3.8, 10.1), "Kumba": (4.6, 9.4)},
    "BF": {"Ouagadougou": (12.4, -1.5), "Bobo-Dioulasso": (11.2, -4.3), "Koudougou": (12.3, -2.4), "Banfora": (10.6, -4.8), "Ouahigouya": (13.6, -2.4), "Pouytenga": (12.2, -0.4), "Dédougou": (12.5, -3.5),
           "Kaya": (13.1, -1.1), "Tenkodogo": (11.8, -0.4), "Fada N'Gourma": (12.1, 0.4), "Dori": (14.0, -0.0)},
    "ML": {"Bamako": (12.6, -8.0), "Sikasso": (11.3, -5.7), "Mopti": (14.5, -4.2), "Koutiala": (12.4, -5.5), "Kayes": (14.4, -11.4), "Ségou": (13.4, -6.3), "Gao": (16.3, -0.0), "Tombouctou": (16.8, -3.0),
           "Kati": (12.7, -8.1), "Kidal": (18.4, 1.4), "San": (13.3, -4.9), "Koulikoro": (12.9, -7.6)},
    "GA": {"Libreville": (0.4, 9.5), "Port-Gentil": (-0.7, 8.8), "Franceville": (-1.6, 13.6), "Oyem": (1.6, 11.6), "Moanda": (-1.6, 13.2), "Lambaréné": (-0.7, 10.2), "Mouila": (-1.9, 11.1),
           "Tchibanga": (-2.9, 11.0), "Makokou": (0.6, 12.9), "Koulamoutou": (-1.1, 12.5), "Owendo": (0.3, 9.5)},
    "CD": {"Kinshasa": (-4.3, 15.3), "Lubumbashi": (-11.7, 27.5), "Mbuji-Mayi": (-6.1, 23.6), "Kananga": (-5.9, 22.4), "Kisangani": (0.5, 25.2), "Goma": (-1.7, 29.2), "Bukavu": (-2.5, 28.9),
           "Tshikapa": (-6.4, 20.8), "Kolwezi": (-10.7, 25.5), "Likasi": (-10.98, 26.7), "Matadi": (-5.8, 13.5), "Uvira": (-3.4, 29.1), "Mbandaka": (0.1, 18.3), "Kikwit": (-5.0, 18.8)},
    "FR": {"Paris": (48.9, 2.4), "Marseille": (43.3, 5.4), "Lyon": (45.8, 4.8), "Toulouse": (43.6, 1.4), "Nice": (43.7, 7.3), "Nantes": (47.2, -1.6), "Montpellier": (43.6, 3.9), "Strasbourg": (48.6, 7.8),
           "Bordeaux": (44.8, -0.6), "Lille": (50.6, 3.1), "Rennes": (48.1, -1.7), "Reims": (49.3, 4.0), "Le Havre": (49.5, 0.1), "Saint-Étienne": (45.4, 4.4), "Toulon": (43.1, 5.9), "Grenoble": (45.2, 5.7),
           "Dijon": (47.3, 5.0), "Angers": (47.5, -0.6), "Nîmes": (43.8, 4.4), "Villeurbanne": (45.8, 4.9), "Montreuil": (48.9, 2.4), "Saint-Denis": (48.9, 2.4), "Créteil": (48.8, 2.5)},
    "BE": {"Bruxelles": (50.8, 4.4), "Anvers": (51.2, 4.4), "Gand": (51.1, 3.7), "Charleroi": (50.4, 4.4), "Liège": (50.6, 5.6), "Bruges": (51.2, 3.2), "Namur": (50.5, 4.9), "Louvain": (50.9, 4.7),
           "Mons": (50.5, 3.9), "Ixelles": (50.8, 4.4), "Schaerbeek": (50.9, 4.4)},
    "CA": {"Montréal": (45.5, -73.6), "Toronto": (43.7, -79.4), "Ottawa": (45.4, -75.7), "Québec": (46.8, -71.2), "Gatineau": (45.5, -75.7), "Laval": (45.6, -73.7), "Longueuil": (45.5, -73.5),
           "Sherbrooke": (45.4, -71.9), "Calgary": (51.0, -114.1), "Vancouver": (49.3, -123.1), "Edmonton": (53.5, -113.5), "Winnipeg": (49.9, -97.1), "Moncton": (46.1, -64.8), "Trois-Rivières": (46.3, -72.5)},
}
_INDEX = {(cc, fold(name)): xy for cc, cities in _C.items() for name, xy in cities.items()}


def city_coords(country: str | None, city: str | None) -> tuple[float, float] | None:
    """Position approximative d'une ville connue (None sinon). La casse et les accents ne comptent pas."""
    if not country or not city:
        return None
    return _INDEX.get((country.upper(), fold(city)))
