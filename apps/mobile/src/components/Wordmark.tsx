import { Image, View } from "react-native";

// Proporção do arquivo (1008 x 722): mantém o logo sem distorcer em qualquer
// largura que a tela pedir.
const ASPECT_RATIO = 1008 / 722;

/**
 * Logotipo oficial da Festaê — caixinha com confete, o arco dourado, o
 * "FESTAê!" e a assinatura PEGUE · MONTE · COMEMORE.
 *
 * O arquivo tem fundo transparente, mas os vazados internos (o miolo do "A",
 * do "ê" e o interior da caixa) continuam no creme da arte original. Por isso
 * ele é feito para telas de fundo creme — sobre navy apareceria um halo.
 */
export function Wordmark({ width = 260 }: { width?: number }) {
  return (
    <View className="items-center">
      <Image
        source={require("../../assets/logo-festae.png")}
        style={{ width, height: width / ASPECT_RATIO }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Festaê — pegue, monte, comemore"
      />
    </View>
  );
}
