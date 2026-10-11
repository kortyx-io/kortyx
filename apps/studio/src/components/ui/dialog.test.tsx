import { Children, type ReactElement, type ReactNode } from "react";
import { expect, it } from "vitest";
import { DialogContent } from "./dialog";

it("keeps existing dialogs dismissible and their backdrop unchanged by default", () => {
  const portal = DialogContent({ children: "Content" });
  const [overlay, content] = Children.toArray(portal.props.children) as [
    ReactElement<Record<string, unknown>>,
    ReactElement<Record<string, unknown>>,
  ];
  expect(overlay.props.className).toBe("fixed inset-0 bg-black/50");
  const children = Children.toArray(content.props.children as ReactNode);
  expect((children[1] as ReactElement).props).toMatchObject({
    "aria-label": "Close dialog",
  });
});

it("allows a controlled flow to omit the close button and customize only its backdrop", () => {
  const onEscapeKeyDown = () => {};
  const portal = DialogContent({
    children: "Content",
    showCloseButton: false,
    overlayClassName: "backdrop-blur-sm",
    onEscapeKeyDown,
  });
  const [overlay, content] = Children.toArray(portal.props.children) as [
    ReactElement<Record<string, unknown>>,
    ReactElement<Record<string, unknown>>,
  ];
  expect(overlay.props.className).toContain("backdrop-blur-sm");
  expect(content.props.onEscapeKeyDown).toBe(onEscapeKeyDown);
  expect(content.props).not.toHaveProperty("showCloseButton");
  expect(Children.toArray(content.props.children as ReactNode)).toEqual([
    "Content",
  ]);
});
