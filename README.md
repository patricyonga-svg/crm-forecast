# CRM Forecast

Application web de suivi des affaires et du forecast pour l'équipe commerciale (Sénégal, Côte d'Ivoire, Cameroun).
Elle remplace la saisie dans l'onglet Detail du fichier « Forecast_Général_Base de donnée ». Le Google Sheet reste
alimenté automatiquement, en lecture seule.

## Fonctionnalités

- Connexion avec Google.
- Liste des affaires avec filtres (pays, étape, LoB, porteur, trimestre), « Mes affaires » et « À relancer ».
- Fiche affaire : modification, historique des échanges, paiements partiels, journal des modifications.
- Tableau de bord par trimestre : objectif, réalisé (facturé) par mois, taux, reste à faire et forecast, par pays et LoB.
- Saisie des objectifs mensuels (managers et admin).
- Copie quotidienne des affaires dans un onglet du Google Sheet.

## Règles de calcul (identiques au fichier)

| Étape | Forecast | Facturé | Encaissé |
|---|---|---|---|
| Opportunité | 0 | 0 | 0 |
| Forecast | devis | 0 | somme des paiements |
| Won Pending | devis | devis | somme des paiements |
| Won | devis | devis | devis |

Le trimestre est calculé à partir de la date de closing (trimestres civils).

## Droits

| Rôle | Voit | Modifie |
|---|---|---|
| Commercial | les affaires de son pays | les affaires dont il est porteur |
| Manager | les affaires de son pays | toutes les affaires et objectifs de son pays |
| Direction | tout | rien |
| Admin | tout | tout, référentiels compris |

Les règles sont appliquées dans la base (Row Level Security), pas seulement dans l'interface.

## Mise en place

1. Créer un projet Supabase et exécuter `supabase/migrations/0001_init.sql` dans l'éditeur SQL.
2. Activer le fournisseur Google dans Supabase (Authentication → Providers).
3. Exporter l'onglet Detail en CSV, puis générer l'import :
   `npm run import -- detail.csv sortie/`. Cela produit `import.sql` (à exécuter dans Supabase) et
   `rapport-import.md` (anomalies à corriger).
4. Copier `.env.example` en `.env.local` et renseigner les valeurs.
5. Déployer sur Vercel et y renseigner les mêmes variables.
6. Pour l'export : créer un compte de service Google, partager le Google Sheet miroir avec son email (éditeur).

## Développement

```
npm install
npm run dev
npm test
```
