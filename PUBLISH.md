# Publish MoneyPilot Web

Use GitHub Desktop for the final publish step:

1. Open GitHub Desktop.
2. Choose `File > Add Local Repository...`.
3. Select `/Users/davidjiang/Documents/GitHub/moneypliot`.
4. Click `Publish repository`.
5. Keep the repository name as `moneypliot`.
6. After publish, open the repository on GitHub.
7. Go to `Settings > Pages`.
8. Set `Source` to `GitHub Actions`.
9. Wait for the `Deploy MoneyPilot Web` workflow to finish.

The iPhone install URL should be:

```text
https://3061988077qq-glitch.github.io/moneypliot/
```

After GitHub Pages is live, verify it from this folder:

```bash
npm run check:deploy-url -- https://3061988077qq-glitch.github.io/moneypliot/
```

Then open that HTTPS URL in iPhone Safari and choose `Share > Add to Home Screen`.
