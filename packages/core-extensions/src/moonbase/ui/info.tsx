import WebpackRequire from "@moonlight-mod/types/discord/require";
import { ExtensionTag } from "@moonlight-mod/types";
import { MoonbaseExtension } from "../types";

type Dependency = {
  id: string;
  type: DependencyType;
};

enum DependencyType {
  Dependency = "dependency",
  Optional = "optional",
  Incompatible = "incompatible"
}

export const tagNames: Record<ExtensionTag, string> = {
  [ExtensionTag.Accessibility]: "Accessibility",
  [ExtensionTag.Appearance]: "Appearance",
  [ExtensionTag.Chat]: "Chat",
  [ExtensionTag.Commands]: "Commands",
  [ExtensionTag.ContextMenu]: "Context Menu",
  [ExtensionTag.DangerZone]: "Danger Zone",
  [ExtensionTag.Development]: "Development",
  [ExtensionTag.Fixes]: "Fixes",
  [ExtensionTag.Fun]: "Fun",
  [ExtensionTag.Markdown]: "Markdown",
  [ExtensionTag.Voice]: "Voice",
  [ExtensionTag.Privacy]: "Privacy",
  [ExtensionTag.Profiles]: "Profiles",
  [ExtensionTag.QualityOfLife]: "Quality of Life",
  [ExtensionTag.Library]: "Library"
};

export default (require: typeof WebpackRequire) => {
  const React = require("common_react");
  const spacepack = require("spacepack_spacepack").spacepack;

  const CommonComponents = require("common_components");
  const UserInfoClasses = spacepack.findByCode(
    "infoScroller",
    "userInfoSection",
    "userInfoSectionHeader"
  )[0].exports;

  const { MoonbaseSettingsStore } =
    require("moonbase_stores") as typeof import("../webpackModules/stores");

  function InfoSection({
    title,
    children
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <div
        style={{
          marginRight: "1em"
        }}
      >
        <CommonComponents.Text
          variant="eyebrow"
          className={UserInfoClasses.userInfoSectionHeader}
        >
          {title}
        </CommonComponents.Text>

        <CommonComponents.Text variant="text-sm/normal">
          {children}
        </CommonComponents.Text>
      </div>
    );
  }

  function Badge({
    color,
    children
  }: {
    color: string;
    children: React.ReactNode;
  }) {
    return (
      <span
        style={{
          borderRadius: ".1875rem",
          padding: "0 0.275rem",
          marginRight: "0.4em",
          backgroundColor: color,
          color: "#fff"
        }}
      >
        {children}
      </span>
    );
  }

  function ExtensionInfo({ ext }: { ext: MoonbaseExtension }) {
    const authors = ext.manifest?.meta?.authors;
    const tags = ext.manifest?.meta?.tags;

    const dependencies: Dependency[] = [];
    if (ext.manifest.dependencies != null) {
      dependencies.push(
        ...ext.manifest.dependencies.map((dep) => ({
          id: dep,
          type: DependencyType.Dependency
        }))
      );
    }

    if (ext.manifest.suggested != null) {
      dependencies.push(
        ...ext.manifest.suggested.map((dep) => ({
          id: dep,
          type: DependencyType.Optional
        }))
      );
    }

    if (ext.manifest.incompatible != null) {
      dependencies.push(
        ...ext.manifest.incompatible.map((dep) => ({
          id: dep,
          type: DependencyType.Incompatible
        }))
      );
    }

    return (
      <>
        {authors != null && (
          <InfoSection title="Authors">
            {authors.map((author, i) => {
              const comma = i !== authors.length - 1 ? ", " : "";
              if (typeof author === "string") {
                return (
                  <span key={i}>
                    {author}
                    {comma}
                  </span>
                );
              } else {
                // TODO: resolve IDs
                return (
                  <span key={i}>
                    {author.name}
                    {comma}
                  </span>
                );
              }
            })}
          </InfoSection>
        )}

        {tags != null && (
          <InfoSection title="Tags">
            {tags.map((tag, i) => {
              const name = tagNames[tag];

              return (
                <Badge
                  key={i}
                  color={
                    tag === ExtensionTag.DangerZone
                      ? "var(--red-400)"
                      : "var(--brand-500)"
                  }
                >
                  {name}
                </Badge>
              );
            })}
          </InfoSection>
        )}

        {dependencies.length > 0 && (
          <InfoSection title="Dependencies">
            {dependencies.map((dep) => {
              const colors = {
                [DependencyType.Dependency]: "var(--brand-500)",
                [DependencyType.Optional]: "var(--orange-400)",
                [DependencyType.Incompatible]: "var(--red-400)"
              };
              const color = colors[dep.type];
              const name = MoonbaseSettingsStore.getExtensionName(dep.id);
              return (
                <Badge color={color} key={dep.id}>
                  {name}
                </Badge>
              );
            })}
          </InfoSection>
        )}
      </>
    );
  }

  return {
    InfoSection,
    ExtensionInfo
  };
};
