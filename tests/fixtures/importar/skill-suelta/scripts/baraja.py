# Baraja las líneas de un fichero (de mentira, para las pruebas).
import random, sys
lineas = open(sys.argv[1]).read().splitlines()
random.shuffle(lineas)
print("\n".join(lineas))
