"""Build shared arrow data and decorations from the supplied, unmodified paths.
Arrow 3 reflects Arrow 4 vertically, as approved by the designer.
Landing keeps its separately supplied, fixed overlapping composition.
"""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / 'assets'
SVG = '{http://www.w3.org/2000/svg}'
PALETTE = [('#0099FF', .5), ('#FF0095', .5), ('#C800FF', .5), ('#508D47', .7),
           ('#B8A391', 1), ('#C6C7C9', .7), ('#FAC119', 1), ('#753245', .7)]

def path(arrow, color='currentColor', opacity=1):
    return f'<path d="{arrow["path"]}" transform="{arrow["transform"]}" fill="{color}" fill-opacity="{opacity}"/>'

def markup(arrow, color, opacity):
    x, y = arrow['origin']
    return f'<g data-arrow-source="{arrow["number"]}" transform="translate(62 382) scale(.6) translate({-x} {-y})">{path(arrow, color, opacity)}</g>'

def main():
    arrows = []
    directions = {1: 1, 2: 3, 3: 5, 4: 7, 5: 4, 6: 0, 7: 2, 8: 6}
    origins = {1: [0, 262.56], 2: [0, 7.5], 3: [0, 7.5], 4: [0, 262.61],
               5: [0, 7.5], 6: [0, 292.46], 7: [0, 48.345], 8: [0, 175.9]}
    for number in range(1, 9):
        source = ET.parse(ROOT / 'arrows' / f'arrow-{4 if number == 3 else number}.svg').getroot()
        arrow = dict(number=number, direction=directions[number], path=source.find(f'{SVG}path').get('d'),
                     viewBox=source.get('viewBox'), origin=origins[number],
                     transform='translate(0 270.11) scale(1 -1)' if number == 3 else '')
        arrows.append(arrow)
        if number == 3:
            (ROOT / 'arrows' / 'arrow-3.svg').write_text(
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{arrow["viewBox"]}"><title>Arrow 3: vertical reflection of supplied Arrow 4</title>{path(arrow,"#231815")}</svg>\n')
    (ROOT / 'back-arrows.json').write_text(json.dumps(arrows, ensure_ascii=False, indent=2) + '\n')
    # Source paths stay identical in every context; only placement, color and opacity change.
    for filename, number, color, opacity in [
            ('photo-decoration.svg', 2, '#FF0095', .5),
            ('photo-decoration-2.svg', 1, '#0099FF', .5),
            ('photo-decoration-3.svg', 8, '#508D47', .7)]:
        arrow = arrows[number - 1]
        (ROOT / filename).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{arrow["viewBox"]}">{path(arrow,color,opacity)}</svg>\n')
    # Enlarged northwest arrow, cropped as in the supplied Info composition.
    (ROOT / 'info-arrow.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 402 874"><g transform="translate(-16 -30) scale(13)">{path(arrows[3],"#0099FF",.5)}</g></svg>\n')
    ordered = sorted(arrows, key=lambda arrow: arrow['direction'])
    for frame in range(8):
        content = ''.join(markup(arrow, *PALETTE[(i+frame) % 8]) for i, arrow in enumerate(ordered))
        # Natural 4:5 artwork stays proportional at every viewport size.
        angle = (frame - 3.5) * 5
        (ROOT / f'process-{frame+1}.svg').write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 140 402 502.5"><rect x="0" y="140" width="402" height="502.5" fill="#EEEEEF"/><g transform="rotate({angle} 143 382)">{content}</g></svg>\n')

if __name__ == '__main__':
    main()
