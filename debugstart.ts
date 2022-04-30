import {parser} from "lezer-python";
import {TreeCursor} from "lezer-tree";
import {readFileSync} from "fs"

export function stringifyTree(t: TreeCursor, source: string, d: number): string {
    var str = "";
    var spaces = " ".repeat(d*2);
    str += spaces + t.type.name;
    if (["Number", "CallExpression", "BinaryExpression", "UnaryExpression", "ArithOp", "VariableName","Boolean", "PropertyName", "String"].includes(t.type.name)) { 
      str += " --> " + source.substring(t.from, t.to)
    }
    str += "\n";
    if (t.firstChild()) {
      do {
        str += stringifyTree(t, source, d+1);
      } while(t.nextSibling());
      t.parent();
    }
    return str;
  }
  

const source = readFileSync("test.py").toString()
var t = parser.parse(source);
console.log("Debug start")
//console.log(JSON.stringify(ast, null, 2));
const str = stringifyTree(t.cursor(), source , 0 )
console.log(stringifyTree(t.cursor(), source , 0 ));


function push(array: any[], ...items: any[]) {
  items.forEach(function(item) {
      array.push(item);
  });
}