/// <reference types="jest" />
import { fireEvent, render } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { CatalogArt } from "@/components/workshop/CatalogArt";
import { catalogFixture } from "./fixtures/workshopCatalog";

it("renders an unknown asset as a neutral preview while retaining its label", async () => {
  const option = catalogFixture.options[0];
  if (!option) throw new Error("Missing fixture");
  const view = await render(
    <View>
      <CatalogArt option={{ ...option, assetKey: "future_character" }} />
      <Text>A future character</Text>
    </View>,
  );
  expect(view.getByText("A future character")).toBeTruthy();
  expect(view.getByText("✦")).toBeTruthy();
});

it("uses remote artwork first and falls back to bundled or neutral art after failures", async () => {
  const option = catalogFixture.options[0];
  if (!option) throw new Error("Missing fixture");
  const view = await render(
    <CatalogArt
      option={{ ...option, previewUrl: "https://assets.example/preview.png" }}
    />,
  );
  expect(view.getByTestId("catalog-art").props.source).toEqual({
    uri: "https://assets.example/preview.png",
  });
  await fireEvent(view.getByTestId("catalog-art"), "error");
  expect(view.getByTestId("catalog-art").props.source).not.toHaveProperty(
    "uri",
  );
  await fireEvent(view.getByTestId("catalog-art"), "error");
  expect(view.getByText("✦")).toBeTruthy();
  await view.rerender(
    <CatalogArt
      option={{
        ...option,
        previewUrl: "https://assets.example/replacement.png",
      }}
    />,
  );
  expect(view.getByTestId("catalog-art").props.source).toEqual({
    uri: "https://assets.example/replacement.png",
  });
});
