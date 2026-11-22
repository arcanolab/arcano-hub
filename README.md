# Arcano Lab Hub

A free module for Foundry VTT v14 that keeps the Arcano Lab modules in one place.

- **Catalog:** browse every Arcano Lab module, see what is installed, inactive or out of date in your world.
- **Install links:** copy the manifest link of a module and paste it in *Setup → Add-on Modules → Install Module*.
- **Update notices:** the Hub tells the GM when a new version of an installed module is out.
- **One button group:** Arcano Lab modules add their tools to a single "Arcano Lab" group in the scene controls, instead of spreading buttons across the toolbar.

## Install

Paste this manifest URL in *Install Module*:

```
https://github.com/arcanolab/arcano-hub/releases/latest/download/module.json
```

## Using it

As GM, click the Arcano Lab icon in the scene controls (left bar) and then the Hub button, or use the **Arcano Lab Hub** button at the top of the Settings sidebar.

The catalog is read from `catalog.json` in this repository, and module versions come from each module's latest GitHub release.

## For module authors (Arcano Lab)

```js
game.modules.get("arcano-hub")?.api?.registerTool({
  name: "my-tool",
  title: "My Tool",
  icon: "modules/arcano-hub/assets/tools/chest.svg",   // or a Font Awesome class
  visible: () => game.user.isGM,
  onClick: () => {}
});
```

## Credits

Fonts: Fraunces, IBM Plex Sans, IBM Plex Mono and Kalam, all under the SIL Open Font License.

Support the Lab: https://www.patreon.com/arcanolab
