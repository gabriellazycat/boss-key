# v0.3 — plano de direção de arte e gameplay (iteração longa)

Pedido do usuário (2026-10-24): andar livre pelo escritório com WASD; só senta quando **clicar no computador**;
diversões espalhadas pelo escritório (já que dá para andar); visual muito mais bonito — iluminação, cor,
cenário, personagens — inspirado em **PEAK** e jogos do gênero. Iterar com prints várias vezes.

## Direção de arte ("PEAK no escritório")
- Cores saturadas e quentes, leitura fácil. Sol de fim de manhã entrando por janelões (manchas de luz no chão),
  poeira flutuando nos feixes, céu/cidade pintados lá fora.
- Paleta: parede creme quente `#F4E7D0` com faixa de destaque turquesa; carpete verde-azulado `#2F8F8A`;
  madeira mel `#D9A066`; acentos laranja `#FF8A3D`, coral `#FF6B6B`, amarelo `#FFD23F`, céu `#7EC8FF`.
- Sombras frias (azuladas), luzes quentes. Grade de cor no passe final (lift/gamma/gain + saturação).
- GTAO (oclusão de ambiente) para contato e profundidade; bloom suave só no que brilha.
- Personagens: bolas com cor própria (como os escoteiros do PEAK), shading em rampa (toon suave) + rim light,
  contorno colorido escuro (não preto), sobrancelhas para todos, bochechas, acessório por pessoa.
- Fonte de títulos: Darumadrop One (a mesma do PEAK).

## Planta v0.3 (32 × 27 m de mundo: x 0-30, z 0-27)
- Mantém sala do chefe, banheiros, cubículos e salão de B1.
- Parede sul (z = 20) vira **meia-parede** (1,1 m) com vãos; cozinha e impressora ficam de costas para ela.
- Nova **sala de descompressão** (z 20-27): sofá + TV, pebolim, 2 fliperamas, cesta de basquete, máquina de
  lanche, pufes; janelões ao sul com sol entrando.

## Gameplay v0.3
- Começa o dia **em pé** perto da mesa. WASD + mouse (cursor travado, mira no centro).
- Mirar no seu monitor e **clicar** (ou E) = sentar. Sentado: E/ESC = levantar; resto igual.
- Diversões andando (todas "físicas": se o chefe vir por ~0,7 s = flagrante = demitido):
  - **Fliperama** (Ball Ops na tela do gabinete) — barulhento.
  - **Pebolim** com um bot — timing.
  - **Corrida de cadeira** — sobe numa cadeira livre e sai voando pelo escritório.
  - **Soneca no sofá** — ronco.
  - **Basquete de papel livre** — arremessa em qualquer lixeira/cesta; mais longe = mais FUN.
  - **Fofoca** com bot na cozinha.
  - Pizza (sexta), café (puxa-saco), relatório.
- Em pé sem álibi (longe da sua mesa, sem café/relatório) no cone do chefe = Suspeita sobe.
- Bots andam: vão à cozinha/sala de descompressão, voltam correndo quando a porta abre (às vezes tarde).
