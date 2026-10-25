from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E
from hashlib import sha256
import json

base=Path(r'C:/sistema tributario dayanex/reportes')
src=Path(r'C:/Users/User/Downloads/REPORTE SEMANAL (1).docx')
out=base/'Reporte semanal segunda entrega 19 al 23 octubre 2026.docx'
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
w='{'+ns['w']+'}'
with ZipFile(src) as z:
    parts={x.filename:z.read(x.filename) for x in z.infolist()}
root=E.fromstring(parts['word/document.xml'])
body=root.find('w:body',ns)
pars=body.findall('w:p',ns)
tables=body.findall('w:tbl',ns)

def text(element,value):
    # Preserve paragraph and run formatting while replacing text only.
    ts=element.findall('.//w:t',ns)
    if ts:
        ts[0].text=value
        ts[0].set('{http://www.w3.org/XML/1998/namespace}space','preserve')
        for t in ts[1:]: t.text=''
    else:
        p=element if element.tag==w+'p' else element.find('w:p',ns)
        r=E.SubElement(p,w+'r');t=E.SubElement(r,w+'t');t.text=value

text(pars[3],'Segunda entrega · Semana del 19 al 23 de octubre de 2026 · 30 horas')
activities=[
 'Continuación del módulo de importación de comprobantes XML.',
 'Extracción de datos de compras y ventas por contribuyente.',
 'Validación de archivos XML y control de duplicados.',
 'Lectura de comprobantes de retención emitidos y recibidos.',
 'Separación de retenciones de renta e IVA en los registros.',
 'Verificación de totales y visualización de retenciones.',
 'Desarrollo de resúmenes mensuales para formularios 103 y 104.',
 'Revisión de obligaciones y fechas referenciales por régimen.',
 'Generación de borradores ATS y revisión de advertencias.',
 'Pruebas de firma electrónica con certificado sintético.',
 'Implementación del flujo SRI en ambiente de pruebas.',
 'Corrección de errores en XML, declaraciones e interfaz.',
 'Refuerzo de autenticación, permisos y registros de seguridad.',
 'Ejecución de pruebas automáticas y verificación con la base de datos.',
 'Documentación de avances y preparación del despliegue web.',
]
rows=tables[1].findall('w:tr',ns)
days=['Lunes 19','Martes 20','Miércoles 21','Jueves 22','Viernes 23']
for i,activity in enumerate(activities):
    cells=rows[i+1].findall('w:tc',ns)
    text(cells[0],days[i//3]+' de octubre del 2026' if i%3==0 else '')
    text(cells[2],activity)
# Update only the material text; preserve the section label and its line break.
material=pars[7].findall('.//w:t',ns)
found=False
for t in material:
    if (t.text or '').startswith('Computadora'):
        t.text='Computadora, conexión a internet, Flutter y Dart, Node.js y NestJS, PostgreSQL, Docker Desktop, Python para verificación, navegador web, archivos XML de prueba y documentación oficial del SRI.'
        found=True
    elif found: t.text=''
if not found: raise RuntimeError('No se encontró el campo de materiales')
text(pars[8],'Total semanal: 30 horas. El tramo de 00:00 a 02:00 corresponde a la madrugada siguiente a la fecha de inicio de cada jornada.')
newxml=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
with ZipFile(src) as zin, ZipFile(out,'w') as zout:
    for item in zin.infolist():
        zout.writestr(item,newxml if item.filename=='word/document.xml' else zin.read(item.filename))
with ZipFile(out) as z:
    changed=[name for name,data in parts.items() if z.read(name)!=data]
assert changed==['word/document.xml'],changed
print(json.dumps({'output':str(out),'changed_parts':changed,'source_sha256':sha256(src.read_bytes()).hexdigest()},ensure_ascii=False))
