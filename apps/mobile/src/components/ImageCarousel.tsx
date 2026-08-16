import { useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Dots } from "./Dots";
import { colors } from "@/theme";

/** Altura usada enquanto a proporção real da foto ainda não chegou. */
const ALTURA_PADRAO = 260;

/** Piso: abaixo disso uma foto bem deitada viraria uma tarja. */
const ALTURA_MINIMA = 200;

/**
 * Teto, em fração da tela. Uma foto de celular em pé tem proporção 3:4 ou
 * 9:16; sem limite, ela empurraria o nome e o preço do kit para fora da
 * primeira tela, e quem abrisse veria só a imagem, sem saber o que é nem
 * quanto custa.
 */
const FRACAO_MAXIMA = 0.62;

/** Proporção real da foto, para o palco nascer do tamanho dela. */
function medirProporcao(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (largura, altura) => resolve(largura > 0 ? altura / largura : null),
      // Falha de medição não pode derrubar a tela: cai na altura padrão.
      () => resolve(null),
    );
  });
}

/**
 * Palco de imagem das telas de detalhe.
 *
 * A altura acompanha a foto e o ajuste é "contain": a imagem aparece
 * inteira, nunca recortada. Antes o palco era fixo em 260 pontos com
 * "cover", o que funcionava para foto deitada e destruía foto em pé —
 * de um arco de balões inteiro sobrava uma faixa do meio. Como aqui é
 * onde o cliente decide se aquele kit é o que ele quer na festa, mostrar
 * pedaço da decoração é o mesmo que não mostrar.
 *
 * O fundo linen continua atrás: item fotografado em fundo claro não
 * "flutua" no branco, e ele preenche a sobra quando a proporção da foto
 * não bate exatamente com a do palco.
 */
export function ImageCarousel({ images, height }: { images: string[]; height?: number }) {
  const [index, setIndex] = useState(0);
  const [alturaMedida, setAlturaMedida] = useState<number | null>(null);
  const { width: larguraDaTela, height: alturaDaTela } = useWindowDimensions();

  // p-5 da Screen dos dois lados.
  const larguraDoSlide = larguraDaTela - 40;
  const chaveDasImagens = images.join("|");

  useEffect(() => {
    if (images.length === 0 || height) return;

    let ativo = true;
    Promise.all(images.map(medirProporcao)).then((proporcoes) => {
      if (!ativo) return;
      const validas = proporcoes.filter((p): p is number => p !== null);
      if (validas.length === 0) return;

      // A mais alta manda: com o palco do tamanho da menor, as outras fotos
      // do carrossel apareceriam menores ainda, com tarja dos dois lados.
      const teto = alturaDaTela * FRACAO_MAXIMA;
      const desejada = larguraDoSlide * Math.max(...validas);
      setAlturaMedida(Math.round(Math.min(Math.max(desejada, ALTURA_MINIMA), teto)));
    });

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDasImagens, larguraDoSlide, alturaDaTela, height]);

  const alturaDoPalco = height ?? alturaMedida ?? ALTURA_PADRAO;

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / larguraDoSlide);
    if (next !== index) setIndex(next);
  }

  if (images.length === 0) {
    return (
      <View
        style={{ height: ALTURA_PADRAO }}
        className="w-full items-center justify-center rounded-3xl bg-linen"
      >
        <Ionicons name="image-outline" size={32} color={colors.gold} />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="overflow-hidden rounded-3xl bg-linen">
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          style={{ width: larguraDoSlide }}
        >
          {images.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={{ width: larguraDoSlide, height: alturaDoPalco }}
              resizeMode="contain"
            />
          ))}
        </ScrollView>
      </View>

      <Dots count={images.length} index={index} />
    </View>
  );
}
